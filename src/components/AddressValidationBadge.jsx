/**
 * AddressValidationBadge.jsx
 * Reusable component — shows USPS validation status for any module
 * that loads a scenario with a property address.
 */
import React from "react";
import { validationDisplay } from "../utils/addressValidation";

export default function AddressValidationBadge({ validation, compact = false }) {
  if (!validation) return null;

  const status  = validation.status || "UNCONFIRMED";
  const display = validationDisplay[status] || validationDisplay.UNCONFIRMED;

  if (compact) {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "10px",
        fontSize: "11px",
        fontFamily: "'DM Mono', monospace",
        fontWeight: 600,
        letterSpacing: "0.04em",
        backgroundColor: display.bg,
        color: display.color,
        border: `1px solid ${display.border}`,
      }}>
        {display.icon} {display.label}
      </span>
    );
  }

  return (
    <div style={{
      padding: "10px 16px",
      backgroundColor: display.bg,
      border: `1px solid ${display.border}`,
      borderLeft: `3px solid ${display.color}`,
      borderRadius: "6px",
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: validation.uspsAddress ? "6px" : "0",
        }}>
          <span style={{ fontSize: "13px" }}>{display.icon}</span>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: display.color,
          }}>
            {display.label}
          </span>
          <span style={{
            fontSize: "10px",
            color: "#484f58",
            fontFamily: "'DM Mono', monospace",
          }}>
            USPS Address Validation
          </span>
        </div>

        {/* Show standardized USPS address if confirmed */}
        {validation.uspsAddress && status === "CONFIRMED" && (
          <div style={{
            fontSize: "12px",
            color: "#8b949e",
            fontFamily: "'DM Mono', monospace",
            marginTop: "4px",
          }}>
            {validation.uspsAddress.line1}, {validation.uspsAddress.city},{" "}
            {validation.uspsAddress.state} {validation.uspsAddress.zip}
            {validation.uspsAddress.zip4 ? `-${validation.uspsAddress.zip4}` : ""}
          </div>
        )}

        {/* Warning for partial/unconfirmed */}
        {(status === "PARTIAL" || status === "UNCONFIRMED") && (
          <div style={{ fontSize: "11px", color: "#fbbf24", marginTop: "4px" }}>
            Address could not be fully confirmed. Verify before appraisal order.
          </div>
        )}

        {/* Warning for undeliverable */}
        {status === "UNDELIVERABLE" && (
          <div style={{ fontSize: "11px", color: "#f85149", marginTop: "4px" }}>
            USPS cannot deliver to this address. Possible vacant lot or fraud risk.
          </div>
        )}
      </div>

      {validation.validatedAt && (
        <div style={{
          fontSize: "10px",
          color: "#484f58",
          fontFamily: "'DM Mono', monospace",
          flexShrink: 0,
          paddingTop: "2px",
        }}>
          {new Date(validation.validatedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}