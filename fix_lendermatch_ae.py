with open("src/modules/LenderMatch.jsx", "r", encoding="utf-8") as f:
    c = f.read()

# ── 1. Add hook import after the engines import block ──
old = '''import {
  runLenderMatch,
  buildDecisionRecord,
  normalizeScenario,
  PRESENTATION_MODES,
  OVERLAY_RISK,
  ELIGIBILITY_STATUS,
  SCENARIO_INTENT,
  ENGINE_VERSION,
} from "../engines/LenderMatchEngine";'''

new = '''import {
  runLenderMatch,
  buildDecisionRecord,
  normalizeScenario,
  PRESENTATION_MODES,
  OVERLAY_RISK,
  ELIGIBILITY_STATUS,
  SCENARIO_INTENT,
  ENGINE_VERSION,
} from "../engines/LenderMatchEngine";
import { useLenderProfiles } from "../hooks/useLenderProfiles";'''

c = c.replace(old, new, 1)

# ── 2. Add hook call inside the component, after savingRecord state ──
old = '''  const resultsRef = useRef(null);'''

new = '''  const resultsRef = useRef(null);
  const { getAeInfo } = useLenderProfiles();'''

c = c.replace(old, new, 1)

# ── 3. Add AePanel component before the Main Component section ──
old = '''// ─── Main Component ───────────────────────────────────────────────────────────'''

new = '''// ─── AE Contact Panel ────────────────────────────────────────────────────────

function AePanel({ lenderName, getAeInfo }) {
  const ae = getAeInfo(lenderName);
  if (!ae) return null;
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: "16px",
      padding: "10px 20px 10px 24px",
      backgroundColor: "#0b1320",
      borderTop: "1px solid #1d2d44",
      borderLeft: "3px solid #1d6fa4",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, paddingTop: "1px" }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#58a6ff",
          fontWeight: 600,
        }}>
          Your AE
        </span>
        {ae.isOverride && (
          <span style={{
            fontSize: "9px",
            padding: "1px 6px",
            borderRadius: "10px",
            backgroundColor: "#1a2a4a",
            color: "#58a6ff",
            border: "1px solid #1d6fa440",
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.04em",
          }}>
            MY OVERRIDE
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center" }}>
        {ae.aeContact && (
          <span style={{ fontSize: "12px", color: "#e6edf3", fontWeight: 600 }}>
            {ae.aeContact}
          </span>
        )}
        {ae.aeEmail && (
          <a href={"mailto:" + ae.aeEmail} style={{
            fontSize: "12px", color: "#58a6ff",
            textDecoration: "none", fontFamily: "'DM Mono', monospace",
          }}>
            {ae.aeEmail}
          </a>
        )}
        {ae.aePhone && (
          <a href={"tel:" + ae.aePhone} style={{
            fontSize: "12px", color: "#58a6ff",
            textDecoration: "none", fontFamily: "'DM Mono', monospace",
          }}>
            {ae.aePhone}
          </a>
        )}
      </div>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────'''

c = c.replace(old, new, 1)

# ── 4. Wrap agency eligible cards with AePanel ──
old = '''              <div style={S.cardsGrid}>
                {(results.agencySection?.eligible || []).map((result, i) => (
                  <LenderScorecardCard
                    key={`${result.lenderId}-${result.program}-${i}`}
                    result={result}
                    onSelectLender={handleSelectLender}
                    isSelected={selectedLender === result.lenderId}
                    style={{ animationDelay: `${i * 40}ms` }}
                  />
                ))}
              </div>'''

new = '''              <div style={S.cardsGrid}>
                {(results.agencySection?.eligible || []).map((result, i) => (
                  <div key={`${result.lenderId}-${result.program}-${i}`}>
                    <LenderScorecardCard
                      result={result}
                      onSelectLender={handleSelectLender}
                      isSelected={selectedLender === result.lenderId}
                      style={{ animationDelay: `${i * 40}ms` }}
                    />
                    <AePanel lenderName={result.lenderName} getAeInfo={getAeInfo} />
                  </div>
                ))}
              </div>'''

c = c.replace(old, new, 1)

# ── 5. Wrap non-QM eligible cards with AePanel ──
old = '''              <div style={S.cardsGrid}>
                {(results.nonQMSection?.eligible || []).map((result, i) => (
                  <AlternativeLenderCard
                    key={`${result.lenderId}-${result.program}-${i}`}
                    result={result}
                    onSelectLender={handleSelectLender}
                    isSelected={selectedLender === result.lenderId}
                    style={{ animationDelay: `${i * 40}ms` }}
                  />
                ))}
              </div>'''

new = '''              <div style={S.cardsGrid}>
                {(results.nonQMSection?.eligible || []).map((result, i) => (
                  <div key={`${result.lenderId}-${result.program}-${i}`}>
                    <AlternativeLenderCard
                      result={result}
                      onSelectLender={handleSelectLender}
                      isSelected={selectedLender === result.lenderId}
                      style={{ animationDelay: `${i * 40}ms` }}
                    />
                    <AePanel lenderName={result.lenderName} getAeInfo={getAeInfo} />
                  </div>
                ))}
              </div>'''

c = c.replace(old, new, 1)

with open("src/modules/LenderMatch.jsx", "w", encoding="utf-8") as f:
    f.write(c)

print("LenderMatch.jsx updated successfully.")