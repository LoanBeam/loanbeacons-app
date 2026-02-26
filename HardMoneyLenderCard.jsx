// ============================================================
// HardMoneyLenderCard.jsx
// Module 6B — Last Resort Path
// Card component for hard money / private money / bridge lenders
// ============================================================

import { useState } from "react";

const HardMoneyLenderCard = ({ result, scenario }) => {
  const [expanded, setExpanded] = useState(false);
  const { lender, score, matchDetails, warnings, maxBrokerPoints, yspAvailable, estimatedFundingDays } = result;

  const { compensation, terms, rehab, qualification, niches, operations } = lender;

  // === Stale broker acceptance check (90 days) ===
  const confirmedDate = lender.acceptingNewBrokersConfirmedDate
    ? new Date(lender.acceptingNewBrokersConfirmedDate)
    : null;
  const daysSinceConfirmed = confirmedDate
    ? Math.floor((Date.now() - confirmedDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = daysSinceConfirmed !== null && daysSinceConfirmed > 90;

  // === ARV LTV Calculation ===
  const arv = parseFloat(scenario?.arv) || 0;
  const loanAmount = parseFloat(scenario?.loanAmount) || 0;
  const ltvOnARV = arv > 0 ? ((loanAmount / arv) * 100).toFixed(1) : null;

  // === Score color ===
  const scoreColor =
    score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  // === Active niches ===
  const activeNiches = Object.entries(niches)
    .filter(([key, val]) => val === true && !key.endsWith("Details"))
    .map(([key]) => nicheLabel(key));

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1a1f2e 0%, #141824 100%)",
        border: "1px solid #2d3548",
        borderRadius: "12px",
        padding: "0",
        marginBottom: "12px",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#e8531a")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2d3548")}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 12px",
          borderBottom: "1px solid #2d3548",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Score badge */}
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: `${scoreColor}18`,
              border: `2px solid ${scoreColor}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: scoreColor, fontSize: "14px", fontWeight: "700", lineHeight: 1 }}>
              {score}
            </span>
            <span style={{ color: scoreColor, fontSize: "9px", opacity: 0.8 }}>MATCH</span>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: "700" }}>
                {lender.name}
              </span>
              <span
                style={{
                  background: "#e8531a22",
                  border: "1px solid #e8531a55",
                  color: "#e8531a",
                  fontSize: "10px",
                  fontWeight: "600",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {lender.type}
              </span>
              {!lender.acceptingNewBrokers && (
                <span
                  style={{
                    background: "#ef444422",
                    border: "1px solid #ef444455",
                    color: "#ef4444",
                    fontSize: "10px",
                    fontWeight: "600",
                    padding: "2px 8px",
                    borderRadius: "4px",
                  }}
                >
                  CLOSED TO NEW BROKERS
                </span>
              )}
              {isStale && lender.acceptingNewBrokers && (
                <span
                  style={{
                    background: "#f59e0b22",
                    border: "1px solid #f59e0b55",
                    color: "#f59e0b",
                    fontSize: "10px",
                    fontWeight: "600",
                    padding: "2px 8px",
                    borderRadius: "4px",
                  }}
                >
                  STATUS UNVERIFIED {daysSinceConfirmed}d
                </span>
              )}
            </div>
            <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>
              {lender.statesActive.length === 50
                ? "Nationwide"
                : `Active: ${lender.statesActive.slice(0, 6).join(", ")}${lender.statesActive.length > 6 ? ` +${lender.statesActive.length - 6} more` : ""}`}
            </div>
          </div>
        </div>

        {/* Right side: funding speed */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              color: terms.fastCloseCapable ? "#10b981" : "#94a3b8",
              fontSize: "22px",
              fontWeight: "800",
              lineHeight: 1,
            }}
          >
            {estimatedFundingDays}
            <span style={{ fontSize: "12px", fontWeight: "500" }}> days</span>
          </div>
          <div style={{ color: "#64748b", fontSize: "11px" }}>typical close</div>
          {terms.fastCloseCapable && (
            <div style={{ color: "#10b981", fontSize: "10px", fontWeight: "600" }}>⚡ FAST CLOSE OK</div>
          )}
        </div>
      </div>

      {/* ── CORE METRICS ROW ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1px",
          background: "#2d3548",
          borderBottom: "1px solid #2d3548",
        }}
      >
        {[
          {
            label: "Max LTV (ARV)",
            value: `${qualification.maxLTVonARV}%`,
            sub: ltvOnARV ? `Your deal: ${ltvOnARV}%` : "ARV-based",
            highlight: ltvOnARV && parseFloat(ltvOnARV) <= qualification.maxLTVonARV,
          },
          {
            label: "Max LTV (Purchase)",
            value: `${qualification.maxLTVonPurchase}%`,
            sub: "of purchase price",
          },
          {
            label: "Loan Range",
            value: `$${formatAmount(qualification.minLoanAmount)} – $${formatAmount(qualification.maxLoanAmount)}`,
            sub: "min / max",
          },
          {
            label: "Terms Available",
            value: terms.available.map((t) => `${t}mo`).join(" · "),
            sub: "loan term options",
          },
        ].map((metric, i) => (
          <div
            key={i}
            style={{
              background: "#141824",
              padding: "12px 16px",
            }}
          >
            <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
              {metric.label}
            </div>
            <div
              style={{
                color: metric.highlight ? "#10b981" : "#f1f5f9",
                fontSize: "16px",
                fontWeight: "700",
              }}
            >
              {metric.value}
            </div>
            <div style={{ color: "#475569", fontSize: "11px" }}>{metric.sub}</div>
          </div>
        ))}
      </div>

      {/* ── COMPENSATION ROW ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1px",
          background: "#2d3548",
          borderBottom: "1px solid #2d3548",
        }}
      >
        {[
          {
            label: "Lender Points",
            value: `${compensation.lenderOriginationPoints.min}–${compensation.lenderOriginationPoints.max} pts`,
            sub: compensation.lenderProcessingFee > 0
              ? `+ $${compensation.lenderProcessingFee.toLocaleString()} processing`
              : "No processing fee",
            color: "#f59e0b",
          },
          {
            label: "Max Broker Points",
            value: `${compensation.maxBrokerPointsAllowed} pts`,
            sub: compensation.brokerFeeStructure.includes("flat_fee")
              ? "Points or flat fee"
              : "Points only",
            color: "#10b981",
          },
          {
            label: "YSP / Backend",
            value: yspAvailable ? "Available" : "Not Offered",
            sub: yspAvailable
              ? `${compensation.yspTiers.length} rate tiers`
              : "Front-end comp only",
            color: yspAvailable ? "#10b981" : "#64748b",
          },
        ].map((comp, i) => (
          <div
            key={i}
            style={{
              background: "#161b29",
              padding: "12px 16px",
            }}
          >
            <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
              {comp.label}
            </div>
            <div style={{ color: comp.color, fontSize: "15px", fontWeight: "700" }}>
              {comp.value}
            </div>
            <div style={{ color: "#475569", fontSize: "11px" }}>{comp.sub}</div>
          </div>
        ))}
      </div>

      {/* ── REHAB & DRAWS ROW ── */}
      {(rehab.drawScheduleAvailable || rehab.rehabBudgetCapacity > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "1px",
            background: "#2d3548",
            borderBottom: "1px solid #2d3548",
          }}
        >
          {[
            {
              label: "Rehab Capacity",
              value: `$${formatAmount(rehab.rehabBudgetCapacity)}`,
            },
            {
              label: "Draw Schedule",
              value: rehab.drawScheduleAvailable ? `${rehab.numberOfDraws} draws` : "None",
            },
            {
              label: "Draw Turnaround",
              value: rehab.drawScheduleAvailable ? `${rehab.drawTurnaroundDays} days` : "N/A",
            },
            {
              label: "Extension Fee",
              value: compensation.lenderExtensionFee,
            },
          ].map((item, i) => (
            <div key={i} style={{ background: "#141824", padding: "10px 16px" }}>
              <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                {item.label}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: "600" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── NICHES ── */}
      {activeNiches.length > 0 && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e2535" }}>
          <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            Product Niches
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {activeNiches.map((niche, i) => (
              <span
                key={i}
                style={{
                  background: "#e8531a14",
                  border: "1px solid #e8531a33",
                  color: "#e8531a",
                  fontSize: "11px",
                  fontWeight: "500",
                  padding: "3px 10px",
                  borderRadius: "20px",
                }}
              >
                {niche}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── MATCH DETAILS / WARNINGS ── */}
      {(matchDetails.length > 0 || warnings.length > 0) && (
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #1e2535", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {matchDetails.map((detail, i) => (
            <span key={i} style={{ color: "#64748b", fontSize: "11px" }}>
              {detail}
            </span>
          ))}
          {warnings.map((warning, i) => (
            <span key={i} style={{ color: "#f59e0b", fontSize: "11px" }}>
              ⚠ {warning}
            </span>
          ))}
        </div>
      )}

      {/* ── FOOTER ROW ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          {/* POF Letter */}
          <OperationsChip
            label="POF Letter"
            available={qualification.proofOfFundsLetterAvailable}
          />
          {/* Same-day term sheet */}
          <OperationsChip
            label="Same-Day Term Sheet"
            available={qualification.sameDayTermSheet}
          />
          {/* 3rd party processing */}
          <OperationsChip
            label="3rd Party Processing"
            available={operations.thirdPartyProcessingAllowed !== "no"}
            note={operations.thirdPartyProcessingAllowed === "case_by_case" ? "(case by case)" : ""}
          />
          {/* Scenario desk */}
          <OperationsChip
            label="Scenario Desk"
            available={operations.scenarioDeskAvailable}
            note={operations.scenarioDeskAvailable ? operations.scenarioDeskHours : ""}
          />
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "transparent",
            border: "1px solid #2d3548",
            color: "#94a3b8",
            fontSize: "12px",
            padding: "6px 14px",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = "#e8531a";
            e.target.style.color = "#e8531a";
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = "#2d3548";
            e.target.style.color = "#94a3b8";
          }}
        >
          {expanded ? "Hide Details ▲" : "Full Details ▼"}
        </button>
      </div>

      {/* ── EXPANDED DETAILS ── */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid #2d3548",
            padding: "20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
          }}
        >
          {/* Exit Strategies */}
          <DetailSection title="Accepted Exit Strategies">
            {lender.dealPreferences.preferredExitStrategies.map((e) => (
              <DetailItem key={e} label={exitStrategyLabel(e)} />
            ))}
          </DetailSection>

          {/* Deal Preferences */}
          <DetailSection title="Deal Preferences">
            <DetailItem label={`Borrower experience: ${lender.qualification.borrowerExperienceRequired}`} />
            <DetailItem label={`Entity: ${entityLabel(lender.qualification.entityRequired)}`} />
            <DetailItem
              label={`Personal guarantee: ${lender.qualification.personalGuaranteeRequired ? "Required" : "Not required"}`}
            />
            <DetailItem
              label={`Cross-collateral: ${lender.qualification.crossCollateralizationAllowed ? "Allowed" : "Not allowed"}`}
            />
            {lender.dealPreferences.dealTypesToAvoid.length > 0 && (
              <DetailItem
                label={`Avoid: ${lender.dealPreferences.dealTypesToAvoid.join(", ")}`}
                warning
              />
            )}
          </DetailSection>

          {/* Full Comp Breakdown */}
          <DetailSection title="Full Compensation Breakdown">
            <DetailItem label={`Lender points: ${compensation.lenderOriginationPoints.min}–${compensation.lenderOriginationPoints.max}`} />
            {compensation.lenderProcessingFee > 0 && (
              <DetailItem label={`Processing fee: $${compensation.lenderProcessingFee.toLocaleString()}`} />
            )}
            {compensation.lenderAdminFee > 0 && (
              <DetailItem label={`Admin fee: $${compensation.lenderAdminFee.toLocaleString()}`} />
            )}
            <DetailItem label={`Max broker points: ${compensation.maxBrokerPointsAllowed}`} />
            <DetailItem label={`Broker fee structure: ${compensation.brokerFeeStructure.join(" or ")}`} />
            {compensation.yspAvailable && compensation.yspTiers.map((tier, i) => (
              <DetailItem key={i} label={`YSP: ${tier.yspPercent}% at +${tier.rateAbovePar}% above par`} />
            ))}
            {compensation.totalFeeCap && (
              <DetailItem label={`Total fee cap: ${compensation.totalFeeCap}%`} warning />
            )}
            <DetailItem
              label={`Prepayment penalty: ${compensation.prepaymentPenalty === "none" ? "None" : compensation.prepaymentPenalty}`}
            />
          </DetailSection>

          {/* Operations */}
          <DetailSection title="Submission & Operations">
            {operations.dedicatedAEAssigned && (
              <DetailItem label={`AE: ${operations.aeContact}`} />
            )}
            <DetailItem label={`Escalation: ${operations.escalationContact}`} />
            <DetailItem label={`Portal: ${operations.submissionPortal}`} />
            {operations.thirdPartyProcessingAllowed !== "no" && (
              <DetailItem label={`3rd party processing: ${operations.thirdPartyProcessingDetails}`} />
            )}
            {operations.overlappingLoanCap && (
              <DetailItem label={`Max concurrent loans: ${operations.overlappingLoanCap}`} warning />
            )}
            {lender.acceptingNewBrokers && confirmedDate && (
              <DetailItem
                label={`Accepting new brokers — confirmed ${confirmedDate.toLocaleDateString()}`}
                warning={isStale}
              />
            )}
            {lender.operations.affiliatedBusinessArrangements?.length > 0 && (
              <DetailItem
                label={`Affiliated services: ${lender.operations.affiliatedBusinessArrangements.join(", ")}`}
                warning
              />
            )}
          </DetailSection>

          {/* Insurance Requirements */}
          <DetailSection title="Insurance Requirements">
            {rehab.insuranceRequirements.buildersRisk && (
              <DetailItem label="Builder's risk required" />
            )}
            {rehab.insuranceRequirements.vacantProperty && (
              <DetailItem label="Vacant property policy required" />
            )}
            <DetailItem
              label={`Liability minimum: $${rehab.insuranceRequirements.liabilityMinimum.toLocaleString()}`}
            />
          </DetailSection>

          {/* Niche Details */}
          {hasNicheDetails(niches) && (
            <DetailSection title="Niche Program Details">
              {Object.entries(niches)
                .filter(([key, val]) => key.endsWith("Details") && val)
                .map(([key, val]) => (
                  <DetailItem key={key} label={val} />
                ))}
            </DetailSection>
          )}
        </div>
      )}
    </div>
  );
};

// ── Small helper components ──

const OperationsChip = ({ label, available, note }) => (
  <span
    style={{
      display: "flex",
      alignItems: "center",
      gap: "4px",
      color: available ? "#10b981" : "#475569",
      fontSize: "11px",
    }}
  >
    <span style={{ fontSize: "10px" }}>{available ? "✓" : "✗"}</span>
    {label}
    {note && <span style={{ color: "#64748b", fontSize: "10px" }}>{note}</span>}
  </span>
);

const DetailSection = ({ title, children }) => (
  <div>
    <div
      style={{
        color: "#e8531a",
        fontSize: "11px",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        marginBottom: "8px",
      }}
    >
      {title}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>{children}</div>
  </div>
);

const DetailItem = ({ label, warning }) => (
  <div style={{ color: warning ? "#f59e0b" : "#94a3b8", fontSize: "12px", display: "flex", gap: "6px" }}>
    <span style={{ color: warning ? "#f59e0b" : "#2d3548" }}>{warning ? "⚠" : "·"}</span>
    {label}
  </div>
);

// ── Label helpers ──

function nicheLabel(key) {
  const labels = {
    fixAndFlipSpecialist: "Fix & Flip",
    groundUpConstruction: "Ground-Up Construction",
    bridgeToPermanent: "Bridge-to-Perm",
    foreignNational: "Foreign National",
    nonWarrantableCondo: "Non-Warrantable Condo",
    landLoans: "Land Loans",
    commercialMixedUse: "Commercial / Mixed-Use",
    fastCloseUnder10Days: "Fast Close (<10 Days)",
    portfolioRepeatBorrower: "Repeat Borrower Program",
    highLeverageRehab: "High-Leverage Rehab",
  };
  return labels[key] || key;
}

function exitStrategyLabel(key) {
  const labels = {
    refinance: "Refinance to permanent financing",
    sale: "Sale of subject property",
    construction_perm: "Construction-to-permanent loan",
  };
  return labels[key] || key;
}

function entityLabel(key) {
  const labels = {
    LLC_required: "LLC required",
    LLC_preferred: "LLC preferred, personal OK",
    personal_ok: "Personal vesting acceptable",
  };
  return labels[key] || key;
}

function formatAmount(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

function hasNicheDetails(niches) {
  return Object.keys(niches).some((k) => k.endsWith("Details") && niches[k]);
}

export default HardMoneyLenderCard;
