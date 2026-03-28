'use strict';

// functions/src/respondToScenarioShare.cjs
// LoanBeacons™ — AE Response Cloud Function Handler
// Exported as { handler } for use in index.js with Gen2 onCall + Secret Manager

const admin  = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const { FieldValue } = admin.firestore;

// ── RESPONSE LABELS ──────────────────────────────────────────────────────────
const RESPONSE_LABELS = {
  approved:   '✅ Approved',
  needs_info: '🔼 More Information Needed',
  declined:   '❌ Declined',
};

// ── BUILD LO NOTIFICATION EMAIL ───────────────────────────────────────────────
function buildLoNotificationEmail({ snapshot, aeEmail, aeResponse, aeNotes, shareId }) {
  const { lo, borrower, property, lender, scenarioId, publicShareToken } = snapshot;
  const responseLabel = RESPONSE_LABELS[aeResponse] || aeResponse;
  const isApproved    = aeResponse === 'approved';
  const isDeclined    = aeResponse === 'declined';
  const statusColor   = isApproved ? '#16a34a' : isDeclined ? '#dc2626' : '#d97706';
  const statusBg      = isApproved ? '#f0fdf4' : isDeclined ? '#fef2f2' : '#fffbeb';
  const viewUrl       = `https://loanbeacons.com/ae-share/${publicShareToken}`;
  const scenarioUrl   = `https://loanbeacons.com/scenario/${scenarioId}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 28px 32px; text-align: center; }
  .header h1 { color: #f5c842; margin: 0; font-size: 20px; }
  .header p  { color: #a0aec0; margin: 6px 0 0; font-size: 13px; }
  .status-box { margin: 24px 32px 0; padding: 16px 20px; border-radius: 8px; background: ${statusBg}; border-left: 4px solid ${statusColor}; }
  .status-box .label { font-size: 11px; font-weight: bold; color: ${statusColor}; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
  .status-box .value { font-size: 18px; font-weight: bold; color: ${statusColor}; }
  .section { padding: 20px 32px; border-bottom: 1px solid #e2e8f0; }
  .section-title { font-size: 11px; font-weight: bold; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field .label { color: #718096; font-size: 12px; margin-bottom: 2px; }
  .field .value { font-weight: 600; color: #1a1a2e; font-size: 13px; }
  .notes-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #2d3748; font-style: italic; }
  .cta { text-align: center; padding: 28px 32px; }
  .cta a { background: #f5c842; color: #1a1a2e; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block; }
  .footer { background: #f7fafc; text-align: center; padding: 16px; font-size: 11px; color: #a0aec0; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🏦 LoanBeacons™</h1>
    <p>Your AE has responded to your scenario share</p>
  </div>

  <div class="status-box">
    <div class="label">AE Response</div>
    <div class="value">${responseLabel}</div>
  </div>

  <div class="section">
    <div class="section-title">Borrower & Scenario</div>
    <div class="grid">
      <div class="field"><div class="label">Borrower</div><div class="value">${borrower?.name || '—'}</div></div>
      <div class="field"><div class="label">Lender</div><div class="value">${lender?.name || '—'}</div></div>
      <div class="field"><div class="label">Property</div><div class="value">${property?.address || '—'}</div></div>
      <div class="field"><div class="label">Loan Amount</div><div class="value">${property?.loanAmount ? '$' + Number(property.loanAmount).toLocaleString() : '—'}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">AE</div>
    <div class="field"><div class="label">Responded from</div><div class="value">${aeEmail}</div></div>
  </div>

  ${aeNotes ? `
  <div class="section">
    <div class="section-title">AE Notes</div>
    <div class="notes-box">${aeNotes}</div>
  </div>` : ''}

  <div class="cta">
    <a href="${scenarioUrl}">Open Scenario in LoanBeacons →</a>
    <p style="font-size:11px;color:#a0aec0;margin-top:12px;">Or view the original share: <a href="${viewUrl}" style="color:#f5c842;">${viewUrl}</a></p>
  </div>

  <div class="footer">
    Sent via LoanBeacons™ · ${new Date().toLocaleDateString()} · <a href="mailto:${lo?.email}" style="color:#f5c842;">Reply to LO</a>
  </div>
</div>
</body>
</html>`;
}

// ── HANDLER (exported for index.js) ──────────────────────────────────────────
async function handler(request) {
  // Set API key at runtime — Secret Manager injects it as env var for Gen2 functions
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const { token, aeResponse, aeNotes, aeEmail } = request.data;

  if (!token)      throw new Error('token is required');
  if (!aeResponse) throw new Error('aeResponse is required');

  const validResponses = ['approved', 'needs_info', 'declined'];
  if (!validResponses.includes(aeResponse))
    throw new Error(`aeResponse must be one of: ${validResponses.join(', ')}`);

  // 1. Find the share doc by publicShareToken
  const snap = await db
    .collection('scenarioShares')
    .where('publicShareToken', '==', token)
    .where('status', '==', 'sent')
    .limit(1)
    .get();

  if (snap.empty) throw new Error('Share not found or not yet sent');

  const shareDoc  = snap.docs[0];
  const shareId   = shareDoc.id;
  const shareData = shareDoc.data();
  const snapshot  = shareData.snapshotPayload || {};

  // 2. Guard against double-response
  if (shareData.ae_response) {
    return {
      success:  false,
      message:  'This scenario has already received a response.',
      response: shareData.ae_response,
    };
  }

  // 3. Write AE response to Firestore
  await db.collection('scenarioShares').doc(shareId).update({
    ae_response:  aeResponse,
    ae_notes:     aeNotes  || '',
    ae_email:     aeEmail  || '',
    responded_at: FieldValue.serverTimestamp(),
    lo_notified:  false,
    updatedAt:    FieldValue.serverTimestamp(),
  });

  // 4. Send notification email to LO
  const loEmail = snapshot?.lo?.email;
  if (loEmail) {
    try {
      const subject = `AE Response: ${RESPONSE_LABELS[aeResponse]} — ${snapshot?.borrower?.name || 'Your Scenario'}`;
      await sgMail.send({
        to:      loEmail,
        from:    { email: 'george@cvls.loans', name: 'LoanBeacons™' },
        replyTo: aeEmail || undefined,
        subject,
        html:    buildLoNotificationEmail({ snapshot, aeEmail, aeResponse, aeNotes, shareId }),
      });

      await db.collection('scenarioShares').doc(shareId).update({
        lo_notified: true,
        updatedAt:   FieldValue.serverTimestamp(),
      });

      console.log(`[respondToScenarioShare] LO notified at ${loEmail} for share ${shareId}`);
    } catch (emailErr) {
      console.error('[respondToScenarioShare] Email send failed:', emailErr);
    }
  } else {
    console.warn(`[respondToScenarioShare] No LO email found for share ${shareId} — skipping notification`);
  }

  // 5. Update dpa_lender_approvals if this was a DPA share
  if (aeResponse === 'approved' && shareData.scenarioId && snapshot?.lender?.name) {
    try {
      const approvalsSnap = await db
        .collection('dpa_lender_approvals')
        .where('scenario_id', '==', shareData.scenarioId)
        .where('approval_state', '==', 'requested')
        .get();

      const batch = db.batch();
      approvalsSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          approval_state: 'approved',
          approved_at:    FieldValue.serverTimestamp(),
          approved_by_ae: aeEmail || '',
        });
      });
      await batch.commit();
      console.log(`[respondToScenarioShare] Updated ${approvalsSnap.size} dpa_lender_approval(s) to approved`);
    } catch (approvalErr) {
      console.error('[respondToScenarioShare] Failed to update dpa_lender_approvals:', approvalErr);
    }
  }

  console.log(`[respondToScenarioShare] Share ${shareId} responded: ${aeResponse}`);

  return {
    success:       true,
    response:      aeResponse,
    responseLabel: RESPONSE_LABELS[aeResponse],
    scenarioId:    shareData.scenarioId || '',
    borrowerName:  snapshot?.borrower?.name || '',
  };
}

exports.handler = handler;
