import React, { useState } from "react";
import { useDecisionRecord } from "../hooks/useDecisionRecord";

const SHARE_TYPES = [
  { value: "AE_SUPPORT",       label: "I need AE support on this scenario" },
  { value: "SCENARIO_REVIEW",  label: "Please review this scenario for eligibility" },
  { value: "FINAL_SUBMISSION", label: "This is ready — please prepare for submission" },
];

export default function AEShareForm({ onSend, sending, sent }) {
  const [emails, setEmails]       = useState([""]);
  const [shareType, setShareType] = useState("AE_SUPPORT");
  const [message, setMessage]     = useState("");
  const { reportFindings } = useDecisionRecord();

  const addEmail = () => {
    if (emails.length < 5) setEmails([...emails, ""]);
  };

  const updateEmail = (i, val) => {
    const updated = [...emails];
    updated[i] = val;
    setEmails(updated);
  };

  const removeEmail = (i) => {
    setEmails(emails.filter((_, idx) => idx !== i));
  };

  const handleSubmit = () => {
    const valid = emails.filter((e) => e.trim().includes("@"));
    if (valid.length === 0) return;
    reportFindings({
      module: 'AE Share Service™',
      moduleId: 'module-BE7',
      summary: `Scenario shared with ${valid.length} AE recipient(s). Purpose: ${shareType}.`,
      details: {
        shareType,
        recipientCount: valid.length,
        hasMessage: message.trim().length > 0,
      },
    });
    onSend(valid, shareType, message);
  };

  const T = {
    bg: "#0d1117", bgCard: "#161b22", border: "#21262d", borderLight: "#30363d",
    amber: "#d97706", amberLight: "#fbbf24", textPrimary: "#e6edf3",
    textSecondary: "#8b949e", textMuted: "#484f58", green: "#3fb950", greenBg: "#0f2913",
    greenBorder: "#1f6527", fontMono: "'DM Mono', monospace", fontBody: "'DM Sans', system-ui, sans-serif",
    fontDisplay: "'Sora', system-ui, sans-serif", radius: "8px",
  };

  if (sent) return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
      <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "16px", color: T.green }}>
        Sent Successfully
      </div>
      <div style={{ fontSize: "13px", color: T.textSecondary, marginTop: "6px" }}>
        The AE will receive the loan scenario email shortly.
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px 24px" }}>

      {/* Share Type */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ fontFamily: T.fontMono, fontSize: "11px", color: T.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
          Purpose
        </label>
        <select
          value={shareType}
          onChange={(e) => setShareType(e.target.value)}
          style={{
            width: "100%", backgroundColor: T.bg, border: `1px solid ${T.borderLight}`,
            borderRadius: T.radius, padding: "9px 12px", fontSize: "13px",
            color: T.textPrimary, fontFamily: T.fontBody, outline: "none",
          }}
        >
          {SHARE_TYPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* AE Emails */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ fontFamily: T.fontMono, fontSize: "11px", color: T.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
          AE Email(s) — max 5
        </label>
        {emails.map((email, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input
              type="email"
              placeholder="ae@lender.com"
              value={email}
              onChange={(e) => updateEmail(i, e.target.value)}
              style={{
                flex: 1, backgroundColor: T.bg, border: `1px solid ${T.borderLight}`,
                borderRadius: T.radius, padding: "9px 12px", fontSize: "13px",
                color: T.textPrimary, fontFamily: T.fontBody, outline: "none",
              }}
            />
            {emails.length > 1 && (
              <button onClick={() => removeEmail(i)} style={{
                background: "none", border: `1px solid ${T.borderLight}`,
                borderRadius: T.radius, color: T.textSecondary,
                padding: "0 12px", cursor: "pointer", fontSize: "16px",
              }}>×</button>
            )}
          </div>
        ))}
        {emails.length < 5 && (
          <button onClick={addEmail} style={{
            background: "none", border: `1px dashed ${T.borderLight}`,
            borderRadius: T.radius, color: T.textSecondary, padding: "7px 14px",
            cursor: "pointer", fontSize: "12px", fontFamily: T.fontMono, width: "100%",
          }}>
            + Add another AE
          </button>
        )}
      </div>

      {/* Message */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontFamily: T.fontMono, fontSize: "11px", color: T.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
          Message (optional)
        </label>
        <textarea
          rows={3}
          placeholder="Any notes for the AE..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{
            width: "100%", backgroundColor: T.bg, border: `1px solid ${T.borderLight}`,
            borderRadius: T.radius, padding: "9px 12px", fontSize: "13px",
            color: T.textPrimary, fontFamily: T.fontBody, outline: "none",
            resize: "vertical", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Send Button */}
      <button
        onClick={handleSubmit}
        disabled={sending || !emails.some((e) => e.includes("@"))}
        style={{
          width: "100%", padding: "12px",
          backgroundColor: sending ? "#451a03" : T.amber,
          color: sending ? T.amberLight : T.bg,
          border: "none", borderRadius: T.radius,
          fontFamily: T.fontDisplay, fontWeight: 700, fontSize: "14px",
          cursor: sending ? "not-allowed" : "pointer",
        }}
      >
        {sending ? "Sending…" : "✉️ Send Scenario to AE"}
      </button>
    </div>
  );
}