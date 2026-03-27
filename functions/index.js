/**
 * LoanBeacons Cloud Functions — functions/index.js
 * Single source of truth. No duplicates. Replace entire file each time.
 *
 * Functions:
 *   1. respondToScenarioShare   — Gen 1 callable, AE submits response
 *   2. lockDecisionRecord       — Gen 1 callable, locks + hashes record
 *   3. extractFHADocument       — Gen 2 callable, Haiku PDF/image extraction
 *
 * NOTE: createScenarioShare is a Firestore trigger managed separately.
 * It is excluded here because functions.firestore is not available in
 * the installed firebase-functions version. Restore from backup if needed:
 * LB-BACKUP-MAR20-2026-AESHARE-COMPLETE
 */

"use strict";

/* ── Gen 1 imports ── */
const functions = require("firebase-functions");
const admin     = require("firebase-admin");

/* ── Gen 2 imports ── */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret }       = require("firebase-functions/params");
const https                  = require("https");

admin.initializeApp();

/* ── Declare the secret ── */
const ANTHROPIC_KEY = defineSecret("ANTHROPIC_KEY");

/* ─────────────────────────────────────────────────────────────
   Load Gen 1 handlers — files are .cjs
   ───────────────────────────────────────────────────────────── */
const { handler: respondToScenarioShareHandler } = require("./src/respondToScenarioShare.cjs");
const { handler: lockDecisionRecordHandler }     = require("./src/lockDecisionRecord.cjs");

/* ─────────────────────────────────────────────────────────────
   1. respondToScenarioShare — Gen 1 callable
   ───────────────────────────────────────────────────────────── */
exports.respondToScenarioShare = functions.https.onCall(
  respondToScenarioShareHandler
);

/* ─────────────────────────────────────────────────────────────
   2. lockDecisionRecord — Gen 1 callable
   ───────────────────────────────────────────────────────────── */
exports.lockDecisionRecord = functions.https.onCall(
  lockDecisionRecordHandler
);

/* ─────────────────────────────────────────────────────────────
   3. extractFHADocument — Gen 2 callable
   Uses firebase-functions/v2 + defineSecret for secret injection.
   ───────────────────────────────────────────────────────────── */
exports.extractFHADocument = onCall(
  { secrets: [ANTHROPIC_KEY] },
  async (request) => {

    const { base64Data, mediaType, documentType } = request.data || {};

    if (!base64Data || typeof base64Data !== "string") {
      throw new HttpsError("invalid-argument", "base64Data is required and must be a string.");
    }
    if (!mediaType || typeof mediaType !== "string") {
      throw new HttpsError("invalid-argument", "mediaType is required (e.g. 'application/pdf').");
    }
    if (!documentType || typeof documentType !== "string") {
      throw new HttpsError("invalid-argument", "documentType is required (e.g. 'mortgage_statement').");
    }

    const apiKey = ANTHROPIC_KEY.value();
    if (!apiKey) {
      throw new HttpsError("internal", "ANTHROPIC_KEY secret value is empty.");
    }

    const prompts = {
      mortgage_statement: `You are a mortgage document extraction specialist.
Extract the following fields from this FHA mortgage statement and return ONLY valid JSON — no explanation, no markdown, no code fences.

Required JSON shape:
{
  "loanNumber": "string or null",
  "currentBalance": "number or null",
  "currentRate": "number or null — decimal form e.g. 0.0625 for 6.25%",
  "currentPayment": "number or null — P&I+MIP monthly amount",
  "lenderName": "string or null",
  "propertyAddress": "string or null"
}

If a field cannot be found, use null. Return only the JSON object.`,

      closing_disclosure: `You are a mortgage document extraction specialist.
Extract the following fields from this Closing Disclosure and return ONLY valid JSON — no explanation, no markdown, no code fences.

Required JSON shape:
{
  "originalLoanAmount": "number or null",
  "closingDate": "string or null — ISO 8601 format YYYY-MM-DD",
  "loanTerm": "number or null — in months",
  "originalRate": "number or null — decimal form e.g. 0.0625 for 6.25%",
  "originalPayment": "number or null — P&I monthly amount"
}

If a field cannot be found, use null. Return only the JSON object.`,

      payoff_statement: `You are a mortgage document extraction specialist.
Extract the following fields from this payoff statement and return ONLY valid JSON — no explanation, no markdown, no code fences.

Required JSON shape:
{
  "payoffAmount": "number or null",
  "perDiemAmount": "number or null",
  "goodThroughDate": "string or null — ISO 8601 format YYYY-MM-DD"
}

If a field cannot be found, use null. Return only the JSON object.`,
    };

    const systemPrompt = prompts[documentType];
    if (!systemPrompt) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported documentType: "${documentType}". Use mortgage_statement, closing_disclosure, or payoff_statement.`
      );
    }

    const isPDF = mediaType === "application/pdf";
    const userContent = isPDF
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
          { type: "text", text: "Extract the required fields from this document." },
        ]
      : [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: "Extract the required fields from this document." },
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
    try {
      anthropicData = JSON.parse(rawResponse.body);
    } catch (e) {
      throw new HttpsError("internal", "Failed to parse Anthropic API response.");
    }

    const rawText = (anthropicData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let extractedData;
    try {
      extractedData = JSON.parse(cleaned);
    } catch (e) {
      console.error("Haiku returned non-JSON:", cleaned);
      throw new HttpsError("internal", "Haiku response was not valid JSON. Raw: " + cleaned.slice(0, 200));
    }

    return { success: true, data: extractedData };
  }
);
