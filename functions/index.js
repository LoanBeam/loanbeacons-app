/**
 * LoanBeacons Cloud Functions — functions/index.js
 * Single source of truth. No duplicates. Replace entire file each time.
 *
 * Functions:
 *   1. respondToScenarioShare   — Gen 1 callable, AE submits response
 *   2. lockDecisionRecord       — Gen 1 callable, locks + hashes record
 *   3. extractFHADocument       — Gen 2 callable, Haiku PDF/image extraction
 */

"use strict";

const functions = require("firebase-functions");
const admin     = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret }       = require("firebase-functions/params");
const https                  = require("https");

admin.initializeApp();

const ANTHROPIC_KEY = defineSecret("ANTHROPIC_KEY");

const { handler: respondToScenarioShareHandler } = require("./src/respondToScenarioShare.cjs");
const { handler: lockDecisionRecordHandler }     = require("./src/lockDecisionRecord.cjs");

exports.respondToScenarioShare = functions.https.onCall(respondToScenarioShareHandler);
exports.lockDecisionRecord     = functions.https.onCall(lockDecisionRecordHandler);

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
