"""
write_last_resort.py
Writes the correct LastResortSection.jsx file with fixed import paths.
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
Command:  python write_last_resort.py
"""

content = r"""import { useState, useEffect } from "react";
import { evaluateHardMoneyPath } from "../../engines/LenderMatchEngine_hardMoney";
import HardMoneyLenderCard from "./HardMoneyLenderCard";

const LastResortSection = ({ scenario, agencyResultCount = 0, nonQMResultCount = 0 }) => {
  const [evaluation, setEvaluation] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!scenario) return;
    const result = evaluateHardMoneyPath(scenario, agencyResultCount, nonQMResultCount);
    setEvaluation(result);
    if (result.heroMode) setCollapsed(false);
  }, [scenario, agencyResultCount, nonQMResultCount]);

  if (!evaluation || (!evaluation.triggered && !evaluation.heroMode)) return null;

  const { heroMode, triggerReasons, results, eligibleCount } = evaluation;

  return (
    <div style={{ marginTop: heroMode ? "0" : "32px" }}>
      <div
        style={{
          background: heroMode ? "linear-gradient(135deg, #e8531a18 0%, #1a1f2e 100%)" : "#141824",
          border: "1px solid #2d3548",
          borderBottom: collapsed ? "1px solid #2d3548" : "none",
          borderRadius: collapsed ? "12px" : "12px 12px 0 0",
          padding: "20px 24px",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#e8531a22", border: "1px solid #e8531a55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
              🔥
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "#f1f5f9", fontSize: heroMode ? "20px" : "16px", fontWeight: "700" }}>
                  Last Resort Path
                </span>
                <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: "400" }}>
                  Hard Money · Private Money · Bridge
                </span>
                {heroMode && (
                  <span style={{ background: "#e8531a", color: "#fff", fontSize: "10px", fontWeight: "700", padding: "3px 10px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    PRIMARY PATH
                  </span>
                )}
                {!heroMode && (
                  <span style={{ background: "#2d3548", color: "#64748b", fontSize: "10px", fontWeight: "600", padding: "3px 10px", borderRadius: "4px" }}>
                    TERTIARY
                  </span>
                )}
              </div>
              <div style={{ color: heroMode ? "#e8531a" : "#64748b", fontSize: "12px", marginTop: "2px", fontStyle: heroMode ? "normal" : "italic" }}>
                {heroMode
                  ? "Conventional and Non-QM paths returned no eligible lenders — hard money is the primary path for this scenario"
                  : "When conventional and non-QM paths are unavailable"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: eligibleCount > 0 ? "#10b981" : "#ef4444", fontSize: "20px", fontWeight: "700" }}>
                {eligibleCount}
              </div>
              <div style={{ color: "#64748b", fontSize: "11px" }}>eligible lenders</div>
            </div>
            <span style={{ color: "#475569", fontSize: "16px" }}>{collapsed ? "▼" : "▲"}</span>
          </div>
        </div>
      </div>

      {!collapsed && (
        <div style={{ border: "1px solid #2d3548", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "20px 24px", background: "#0f1219" }}>
          {triggerReasons.length > 0 && (
            <div style={{ background: "#1a1f2e", border: "1px solid #2d3548", borderRadius: "8px", padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                Routing Triggers
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {triggerReasons.map((reason, i) => (
                  <div key={i} style={{ color: "#94a3b8", fontSize: "12px", display: "flex", gap: "8px" }}>
                    <span style={{ color: "#e8531a" }}>→</span>
                    {reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {eligibleCount === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#64748b", marginBottom: "8px" }}>
                No eligible hard money lenders found
              </div>
              <div style={{ fontSize: "13px" }}>
                This may be due to loan amount, state, or deal structure. Contact your hard money reps
                directly or review the{" "}
                <span style={{ color: "#e8531a", cursor: "pointer" }}>Lender Profile Builder</span> for
                unlisted lenders.
              </div>
            </div>
          )}

          {results.map((result) => (
            <HardMoneyLenderCard key={result.lender.id} result={result} scenario={scenario} />
          ))}

          <div style={{ marginTop: "16px", padding: "12px 16px", background: "#1a1f2e", borderRadius: "8px", border: "1px solid #1e2535", color: "#475569", fontSize: "11px", lineHeight: "1.6" }}>
            <strong style={{ color: "#64748b" }}>Hard Money Disclosure:</strong> Hard money and private money
            loans carry significantly higher rates, points, and fees than conventional financing. These products
            are intended for short-term use by experienced investors. Rates are not displayed in compliance with
            AC2 guidelines — obtain current pricing directly from the lender. Lender profiles are self-reported
            and subject to change. Always verify current guidelines before submitting.
          </div>
        </div>
      )}
    </div>
  );
};

export default LastResortSection;
"""

path = "src/components/lenderMatch/LastResortSection.jsx"
with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("LastResortSection.jsx written successfully.")
