/**
 * LoanBeacons Cloud Functions — functions/index.js
 * Single source of truth. No duplicates. Replace entire file each time.
 *
 * Functions:
 *   1. respondToScenarioShare   — Gen 2 callable, AE submits response
 *   2. lockDecisionRecord       — Gen 2 callable, locks + hashes record
 *   3. extractFHADocument       — Gen 2 callable, Haiku PDF/image extraction
 *   4. createScenarioShare      — Gen 2 Firestore trigger, sends AE share email
 *   5. getShareByToken          — Gen 2 callable, retrieves share by token
 *   6. retryScenarioShare       — Gen 2 callable, resends AE share email
 */

"use strict";

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated }  = require("firebase-functions/v2/firestore");
const { defineSecret }       = require("firebase-functions/params");
const https                  = require("https");
const sgMail                 = require("@sendgrid/mail");

admin.initializeApp();

const ANTHROPIC_KEY = defineSecret("ANTHROPIC_KEY");
const SENDGRID_KEY  = defineSecret("SENDGRID_API_KEY");

const { handler: respondToScenarioShareHandler } = require("./src/respondToScenarioShare.cjs");
const { handler: lockDecisionRecordHandler }     = require("./src/lockDecisionRecord.cjs");

// ─── 1. respondToScenarioShare ────────────────────────────────────────────────
exports.respondToScenarioShare = onCall(
  { secrets: [SENDGRID_KEY] },
  async (request) => {
    process.env.SENDGRID_API_KEY = SENDGRID_KEY.value();
    return respondToScenarioShareHandler(request);
  }
);

// ─── 2. lockDecisionRecord ────────────────────────────────────────────────────
exports.lockDecisionRecord = onCall({}, lockDecisionRecordHandler);

// ─── 3. extractFHADocument ────────────────────────────────────────────────────
exports.extractFHADocument = onCall(
  { secrets: [ANTHROPIC_KEY] },
  async (request) => {
    const { base64Data, mediaType, documentType } = request.data || {};

    if (!base64Data || typeof base64Data !== "string")
      throw new HttpsError("invalid-argument", "base64Data is required.");
    if (!mediaType || typeof mediaType !== "string")
      throw new HttpsError("invalid-argument", "mediaType is required.");
    if (!documentType || typeof documentType !== "string")
      throw new HttpsError("invalid-argument", "documentType is required.");

    const apiKey = ANTHROPIC_KEY.value();
    if (!apiKey) throw new HttpsError("internal", "ANTHROPIC_KEY secret is empty.");

    const prompts = {
      mortgage_statement: `You are a mortgage document extraction specialist.
Extract fields from this FHA mortgage statement and return ONLY valid JSON — no explanation, no markdown, no code fences.

Required JSON shape:
{
  "loanNumber": "string or null",
  "fhaCaseNumber": "string or null — look for FHA Case # in format 105-XXXXXXX-XXX",
  "currentBalance": "number or null — current outstanding loan balance",
  "currentRate": "number or null — interest rate in DECIMAL form: 7.25% = 0.0725",
  "originalPayment": "number or null — monthly P&I payment ONLY, NOT total payment with escrow",
  "monthlyMIP": "number or null — monthly MIP dollar amount (mortgage insurance premium)",
  "ufmipPaid": "number or null — original UFMIP paid at closing in dollars (upfront MIP)",
  "lenderName": "string or null",
  "propertyAddress": "string or null",
  "paymentsMade": "number or null — total number of payments made to date",
  "originationDate": "string or null — original loan closing date in YYYY-MM-DD format"
}

CRITICAL RULES:
- currentRate MUST be decimal: 7.250% becomes 0.0725 NOT 7.25
- originalPayment is P&I ONLY — do not include MIP, taxes, insurance, or total payment
- fhaCaseNumber is typically formatted 105-XXXXXXX-XXX — look carefully
- ufmipPaid is the upfront MIP paid at origination (not monthly MIP)
- If any field is not found, use null
Return ONLY the JSON object.`,

      closing_disclosure: `You are a mortgage document extraction specialist.
Extract fields from this FHA Closing Disclosure or HUD-1 and return ONLY valid JSON — no explanation, no markdown, no code fences.

Required JSON shape:
{
  "originalLoanAmount": "number or null — base loan amount before UFMIP",
  "closingDate": "string or null — closing date in YYYY-MM-DD format",
  "loanTerm": "number or null — loan term in months (360 for 30 years)",
  "originalRate": "number or null — interest rate in DECIMAL form: 7.25% = 0.0725",
  "originalPayment": "number or null — monthly P&I payment ONLY",
  "monthlyMIP": "number or null — monthly MIP dollar amount",
  "ufmipFinanced": "number or null — UFMIP amount financed (upfront MIP dollars)",
  "annualMIPRate": "number or null — annual MIP rate as decimal: 0.55% = 0.0055",
  "fhaCaseNumber": "string or null — format 105-XXXXXXX-XXX",
  "propertyAddress": "string or null",
  "salePrice": "number or null — property sale price"
}

CRITICAL RULES:
- ALL rates must be decimal: 7.25% = 0.0725, 0.55% = 0.0055
- originalPayment is P&I ONLY — not total PITI
- fhaCaseNumber typically formatted 105-XXXXXXX-XXX
- ufmipFinanced is the upfront mortgage insurance premium amount in dollars
- If any field is not found, use null
Return ONLY the JSON object.`,

      payoff_statement: `You are a mortgage document extraction specialist.
Extract fields from this payoff statement and return ONLY valid JSON — no explanation, no markdown, no code fences.

Required JSON shape:
{
  "payoffAmount": "number or null",
  "perDiemAmount": "number or null",
  "goodThroughDate": "string or null — ISO 8601 format YYYY-MM-DD"
}

If a field cannot be found, use null. Return only the JSON object.`,
    };

    const systemPrompt = prompts[documentType];
    if (!systemPrompt)
      throw new HttpsError("invalid-argument",
        `Unsupported documentType: "${documentType}". Use mortgage_statement, closing_disclosure, or payoff_statement.`);

    const isPDF = mediaType === "application/pdf";
    const userContent = isPDF
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
          { type: "text", text: "Extract all required fields from this document. Follow the CRITICAL RULES exactly." },
        ]
      : [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: "Extract all required fields from this document. Follow the CRITICAL RULES exactly." },
        ];

    const requestBody = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const rawResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      };
      const req = https.request(options, (res) => {
        let chunks = "";
        res.on("data", (chunk) => { chunks += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, body: chunks }));
      });
      req.on("error", (err) => reject(err));
      req.write(requestBody);
      req.end();
    });

    if (rawResponse.statusCode !== 200) {
      console.error("Anthropic API error:", rawResponse.statusCode, rawResponse.body);
      throw new HttpsError("internal", `Anthropic API returned status ${rawResponse.statusCode}.`);
    }

    let anthropicData;
    try { anthropicData = JSON.parse(rawResponse.body); }
    catch (e) { throw new HttpsError("internal", "Failed to parse Anthropic API response."); }

    const rawText = (anthropicData.content || [])
      .filter((b) => b.type === "text").map((b) => b.text).join("").trim();

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let extractedData;
    try { extractedData = JSON.parse(cleaned); }
    catch (e) {
      console.error("Haiku returned non-JSON:", cleaned);
      throw new HttpsError("internal", "Haiku response was not valid JSON. Raw: " + cleaned.slice(0, 200));
    }

    return { success: true, data: extractedData };
  }
);

// ─── 4. createScenarioShare — Firestore trigger ───────────────────────────────
// Matches DPAIntelligence.jsx addDoc fields:
// { scenarioId, aeEmails[], shareType, message, status:'pending', userId,
//   dpaContext:{ programName, programType, programStatus, adminAgency, source, dpaAmount, lenderName },
//   moduleContext:{ moduleName, moduleNumber } }
exports.createScenarioShare = onDocumentCreated(
  { document: "scenarioShares/{shareId}", secrets: [SENDGRID_KEY] },
  async (event) => {
    const share = event.data.data();
    if (!share) return;

    sgMail.setApiKey(SENDGRID_KEY.value());

    const {
      aeEmails,
      shareType,
      message,
      userId,
      dpaContext = {},
      moduleContext = {},
      scenarioId,
    } = share;

    // aeEmails is an array written by DPAIntelligence
    const emailList = Array.isArray(aeEmails)
      ? aeEmails.filter(Boolean)
      : (aeEmails ? [aeEmails] : []);

    if (emailList.length === 0) {
      console.error("[createScenarioShare] No aeEmails on doc:", event.params.shareId);
      return;
    }

    // Look up LO info from Firebase Auth
    let loName  = "Your Loan Officer";
    let loEmail = "george@cvls.loans";
    if (userId) {
      try {
        const userRecord = await admin.auth().getUser(userId);
        loName  = userRecord.displayName || loName;
        loEmail = userRecord.email       || loEmail;
      } catch (e) {
        console.warn("[createScenarioShare] Could not fetch LO user:", e.message);
      }
    }

    const isApprovalRequest = shareType === "AE_SUPPORT";
    const subject = isApprovalRequest
      ? `[LoanBeacons] DPA Approval Request — ${dpaContext.programName || "Program Review"}`
      : `[LoanBeacons] Scenario Review Request from ${loName}`;

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1e3a5f;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">🏦 LoanBeacons™</h1>
          <p style="color:#93c5fd;margin:4px 0 0;">Loan Intelligence Platform</p>
        </div>
        <div style="background:#f9fafb;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
          <p style="font-size:16px;color:#111827;">Hi,</p>
          <p style="color:#374151;">
            <strong>${loName}</strong> has ${isApprovalRequest ? "requested your approval on a DPA program" : "shared a loan scenario with you"} via LoanBeacons™.
          </p>
          ${dpaContext.programName  ? `<p style="color:#374151;"><strong>Program:</strong> ${dpaContext.programName}${dpaContext.programType ? ` (${dpaContext.programType})` : ""}</p>` : ""}
          ${dpaContext.programStatus ? `<p style="color:#374151;"><strong>Status:</strong> ${dpaContext.programStatus}</p>` : ""}
          ${dpaContext.dpaAmount     ? `<p style="color:#374151;"><strong>DPA Amount:</strong> ${dpaContext.dpaAmount}</p>` : ""}
          ${dpaContext.adminAgency   ? `<p style="color:#374151;"><strong>Agency:</strong> ${dpaContext.adminAgency}</p>` : ""}
          ${dpaContext.lenderName    ? `<p style="color:#374151;"><strong>Lender:</strong> ${dpaContext.lenderName}</p>` : ""}
          ${message ? `<div style="background:#f3f4f6;border-radius:6px;padding:12px 16px;margin:16px 0;"><p style="color:#374151;font-style:italic;margin:0;">"${message}"</p></div>` : ""}
          ${moduleContext.moduleName ? `<p style="color:#6b7280;font-size:13px;">Module: ${moduleContext.moduleName}</p>` : ""}
          <p style="color:#374151;margin-top:16px;">
            Please reply directly to <a href="mailto:${loEmail}" style="color:#1e3a5f;">${loName} (${loEmail})</a>.
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            Powered by LoanBeacons™ · ${new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    `;

    let successCount = 0;
    for (const aeEmail of emailList) {
      try {
        await sgMail.send({
          to: aeEmail.trim(),
          from: { email: "george@cvls.loans", name: "LoanBeacons™" },
          replyTo: loEmail,
          subject,
          html: htmlBody,
        });
        console.log(`[createScenarioShare] Sent to ${aeEmail} — share ${event.params.shareId}`);
        successCount++;
      } catch (err) {
        console.error(`[createScenarioShare] SendGrid error for ${aeEmail}:`, err.response?.body || err.message);
      }
    }

    await event.data.ref.update({
      status:       successCount > 0 ? "sent" : "failed",
      emailSent:    successCount > 0,
      emailSentAt:  admin.firestore.FieldValue.serverTimestamp(),
      emailsSentTo: emailList,
    });
  }
);

// ─── 5. getShareByToken ───────────────────────────────────────────────────────
exports.getShareByToken = onCall({}, async (request) => {
  const { token } = request.data || {};
  if (!token || typeof token !== "string")
    throw new HttpsError("invalid-argument", "token is required.");

  const db   = admin.firestore();
  const snap = await db.collection("scenarioShares")
    .where("token", "==", token)
    .limit(1)
    .get();

  if (snap.empty)
    throw new HttpsError("not-found", "Share not found or expired.");

  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
});

// ─── 6. retryScenarioShare ────────────────────────────────────────────────────
exports.retryScenarioShare = onCall(
  { secrets: [SENDGRID_KEY] },
  async (request) => {
    const { shareId } = request.data || {};
    if (!shareId || typeof shareId !== "string")
      throw new HttpsError("invalid-argument", "shareId is required.");

    sgMail.setApiKey(SENDGRID_KEY.value());

    const db     = admin.firestore();
    const docSnap = await db.collection("scenarioShares").doc(shareId).get();
    if (!docSnap.exists)
      throw new HttpsError("not-found", "Share document not found.");

    const share     = docSnap.data();
    const emailList = Array.isArray(share.aeEmails)
      ? share.aeEmails.filter(Boolean)
      : (share.aeEmails ? [share.aeEmails] : []);

    if (emailList.length === 0)
      throw new HttpsError("failed-precondition", "No AE emails found on share.");

    const loEmail = share.loEmail || "george@cvls.loans";
    const loName  = share.loName  || "Your Loan Officer";

    try {
      await sgMail.send({
        to:      emailList,
        from:    { email: "george@cvls.loans", name: "LoanBeacons™" },
        replyTo: loEmail,
        subject: `Reminder: ${loName} is waiting for your response — LoanBeacons™`,
        html:    `<p>This is a reminder from <strong>${loName}</strong>. Please reply at your earliest convenience at <a href="mailto:${loEmail}">${loEmail}</a>.</p>`,
      });
      await docSnap.ref.update({
        retried:   true,
        retriedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true };
    } catch (err) {
      console.error("[retryScenarioShare] SendGrid error:", err.response?.body || err.message);
      throw new HttpsError("internal", "Failed to resend: " + err.message);
    }
  }
);
