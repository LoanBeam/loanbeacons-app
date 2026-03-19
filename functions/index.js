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

// ─────────────────────────────────────────────
// HELPER: Build Scenario Snapshot
// ─────────────────────────────────────────────
async function buildScenarioSnapshot(shareDoc) {
  const { scenarioId, userId, aeEmails, shareType, message } = shareDoc;

  // Fetch scenario
  const scenarioSnap = await db.collection("scenarios").doc(scenarioId).get();
  if (!scenarioSnap.exists) throw new Error("Scenario not found: " + scenarioId);
  const s = scenarioSnap.data();

  // Fetch LO profile
  const loSnap = await db.collection("userProfiles").doc("default").get();
  const lo = loSnap.exists ? loSnap.data() : {};

  // Fetch lender profile (from scenario's selectedLenderId if present)
  let lender = {};
  if (s.selectedLenderId) {
    const lenderSnap = await db.collection("lenders").doc(s.selectedLenderId).get();
    if (lenderSnap.exists) lender = lenderSnap.data();
  }

  return {
    scenarioId,
    shareType,
    message: message || "",
    lo: {
      name: lo.displayName || lo.name || "Loan Officer",
      email: lo.email || "",
      phone: lo.phone || "",
      nmls: lo.nmlsId || "",
      company: lo.company || "",
    },
    lender: {
      name: lender.lenderName || lender.name || "",
      logoUrl: lender.logoUrl || "",
    },
    borrower: {
      name: s.borrowerName || "",
      creditScore: s.creditScore || "",
      income: s.monthlyIncome || s.grossMonthlyIncome || "",
    },
    property: {
      address: s.propertyAddress || s.subjectPropertyAddress || "",
      city: s.propertyCity || "",
      state: s.propertyState || "",
      value: s.propertyValue || s.estimatedValue || "",
      loanAmount: s.loanAmount || s.baseLoanAmount || "",
      ltv: s.ltv || "",
      loanType: s.loanType || s.loanPurpose || "",
      loanProduct: s.loanProduct || s.loanProgram || "",
    },
    piti: {
      principal: s.principalAndInterest || s.piPayment || "",
      taxes: s.monthlyTaxes || s.propertyTaxMonthly || "",
      insurance: s.monthlyInsurance || s.hazardInsuranceMonthly || "",
      hoa: s.hoaMonthly || s.monthlyHOA || "",
      mip: s.mipMonthly || s.monthlyMIP || "",
      total: s.totalHousing || s.totalPITI || "",
    },
    dti: {
      front: s.frontDti || s.frontEndDTI || "",
      back: s.backDti || s.backEndDTI || "",
    },
    intelligence: {
      ausResult: s.ausResult || s.ausFindings || "",
      dpaEligible: s.dpaEligible || false,
      craFlag: s.craEligible || s.craFlag || false,
      usdaEligible: s.usdaEligible || false,
      vaEligible: s.vaEligible || false,
    },
    aeEmails,
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// HELPER: Build HTML Email
// ─────────────────────────────────────────────
function buildEmailHtml(snap) {
  const { lo, lender, borrower, property, piti, dti, intelligence, shareType, message, scenarioId, publicShareToken } = snap;

  const shareTypeLabel = {
    AE_SUPPORT: "I need AE support on this scenario",
    SCENARIO_REVIEW: "Please review this scenario for eligibility",
    FINAL_SUBMISSION: "This is ready — please prepare for submission",
  }[shareType] || shareType;

  const flag = (val) => val ? "✅ Yes" : "—";
  const fmt = (val) => val || "—";
  const fmtCurrency = (val) => val ? `$${Number(val).toLocaleString()}` : "—";
  const fmtPct = (val) => val ? `${val}%` : "—";

  const viewUrl = `https://loanbeacons.com/ae-share/${publicShareToken}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
  .wrapper { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 28px 32px; text-align: center; }
  .header img { height: 40px; margin-bottom: 8px; }
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
    <h1>🏦 LoanBeacons™</h1>
    <p>Loan Scenario from ${fmt(lo.name)} ${lo.company ? `· ${lo.company}` : ""}</p>
    <span class="badge">${shareTypeLabel}</span>
  </div>

  ${lender.logoUrl ? `<div style="text-align:center;padding:16px 0 0;"><img src="${lender.logoUrl}" class="lender-logo" alt="${lender.name}"></div>` : ""}
  ${lender.name ? `<div style="text-align:center;padding:4px 0 12px;font-size:13px;color:#4a5568;font-weight:600;">${lender.name}</div>` : ""}

  ${message ? `<div class="section"><div class="section-title">Message from LO</div><div class="message-box">${message}</div></div>` : ""}

  <div class="section">
    <div class="section-title">Borrower</div>
    <div class="grid">
      <div class="field"><div class="label">Name</div><div class="value">${fmt(borrower.name)}</div></div>
      <div class="field"><div class="label">Credit Score</div><div class="value">${fmt(borrower.creditScore)}</div></div>
      <div class="field"><div class="label">Gross Monthly Income</div><div class="value">${fmtCurrency(borrower.income)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Property & Loan</div>
    <div class="grid">
      <div class="field full"><div class="label">Property Address</div><div class="value">${fmt(property.address)}${property.city ? `, ${property.city}` : ""}${property.state ? `, ${property.state}` : ""}</div></div>
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
    <a href="${viewUrl}">View Full Scenario Online →</a>
    <p style="font-size:11px;color:#a0aec0;margin-top:12px;">Scenario ID: ${scenarioId}</p>
  </div>

  <div class="footer">
    Sent via LoanBeacons™ · ${new Date().toLocaleDateString()} · <a href="mailto:${lo.email}" style="color:#f5c842;">Reply to LO</a>
  </div>

</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// FUNCTION 1: createScenarioShare (Firestore trigger)
// Fires when LO writes to scenarioShares/{shareId}
// ─────────────────────────────────────────────
exports.createScenarioShare = onDocumentCreated(
  "scenarioShares/{shareId}",
  async (event) => {
    const shareId = event.params.shareId;
    const shareDoc = event.data.data();

    // Validate
    if (!shareDoc.aeEmails || shareDoc.aeEmails.length === 0 || shareDoc.aeEmails.length > 5) {
      await db.collection("scenarioShares").doc(shareId).update({
        status: "failed",
        lastError: "aeEmails must be between 1 and 5 addresses.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    try {
      // Generate server-side token
      const publicShareToken = crypto.randomUUID();

      // Build snapshot
      const snapshot = await buildScenarioSnapshot(shareDoc);
      snapshot.publicShareToken = publicShareToken;

      // Send emails to each AE
      const emailPromises = shareDoc.aeEmails.map((aeEmail) => {
        const subject = `Loan Scenario from ${snapshot.lo.name} | ${snapshot.property.loanProduct || snapshot.property.loanType || "Loan"} – ${snapshot.property.city || ""}, ${snapshot.property.state || ""}${snapshot.lender.name ? ` | Re: ${snapshot.lender.name}` : ""}`;

        return sgMail.send({
          to: aeEmail,
          from: {
            email: process.env.SENDGRID_FROM || "noreply@loanbeacons.com",
            name: "LoanBeacons™",
          },
          replyTo: snapshot.lo.email || undefined,
          subject,
          html: buildEmailHtml(snapshot),
        });
      });

      await Promise.all(emailPromises);

      // Update share doc with success + token
      await db.collection("scenarioShares").doc(shareId).update({
        status: "sent",
        publicShareToken,
        snapshotPayload: snapshot,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("createScenarioShare error:", err);
      await db.collection("scenarioShares").doc(shareId).update({
        status: "failed",
        lastError: err.message || "Unknown error",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

// ─────────────────────────────────────────────
// FUNCTION 2: getShareByToken (Public HTTP endpoint)
// GET /getShareByToken?token=xxx
// ─────────────────────────────────────────────
exports.getShareByToken = onRequest(
  { cors: true },
  async (req, res) => {
    const token = req.query.token;
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    try {
      const snap = await db
        .collection("scenarioShares")
        .where("publicShareToken", "==", token)
        .where("status", "==", "sent")
        .limit(1)
        .get();

      if (snap.empty) {
        return res.status(404).json({ error: "Share not found or not yet sent" });
      }

      const doc = snap.docs[0];

      // Log viewedAt + increment viewCount
      await doc.ref.update({
        viewedAt: FieldValue.serverTimestamp(),
        viewCount: FieldValue.increment(1),
      });

      return res.status(200).json({
        shareId: doc.id,
        ...doc.data().snapshotPayload,
      });
    } catch (err) {
      console.error("getShareByToken error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────
// FUNCTION 3: retryScenarioShare (Callable — BE-7)
// LO retries a failed share without creating a new doc
// ─────────────────────────────────────────────
exports.retryScenarioShare = onCall(async (request) => {
  const { shareId } = request.data;
  if (!shareId) throw new Error("shareId is required");

  const shareRef = db.collection("scenarioShares").doc(shareId);
  const shareSnap = await shareRef.get();

  if (!shareSnap.exists) throw new Error("Share document not found");

  const shareDoc = shareSnap.data();

  if (shareDoc.status === "sent") {
    return { success: false, message: "Already sent successfully" };
  }

  try {
    const publicShareToken = shareDoc.publicShareToken || crypto.randomUUID();
    const snapshot = await buildScenarioSnapshot(shareDoc);
    snapshot.publicShareToken = publicShareToken;

    const emailPromises = shareDoc.aeEmails.map((aeEmail) => {
      const subject = `Loan Scenario from ${snapshot.lo.name} | ${snapshot.property.loanProduct || "Loan"} – ${snapshot.property.city || ""}, ${snapshot.property.state || ""}${snapshot.lender.name ? ` | Re: ${snapshot.lender.name}` : ""}`;
      return sgMail.send({
        to: aeEmail,
        from: { email: process.env.SENDGRID_FROM || "noreply@loanbeacons.com", name: "LoanBeacons™" },
        replyTo: snapshot.lo.email || undefined,
        subject,
        html: buildEmailHtml(snapshot),
      });
    });

    await Promise.all(emailPromises);

    await shareRef.update({
      status: "sent",
      publicShareToken,
      snapshotPayload: snapshot,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
    });

    return { success: true };
  } catch (err) {
    await shareRef.update({
      status: "failed",
      lastError: err.message,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new Error("Retry failed: " + err.message);
  }
}); 
const { lockDecisionRecord } = require('./src/lockDecisionRecord.cjs'); 
exports.lockDecisionRecord = lockDecisionRecord; 
const { respondToScenarioShare } = require('./src/respondToScenarioShare.cjs');
exports.respondToScenarioShare = respondToScenarioShare;