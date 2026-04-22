// ============================================================
// LenderIntakeForm.jsx
// Module 6B — Lender Self-Reported Profile Form
//
// Three lender categories: Conventional/Agency, Non-QM, Hard Money
// Writes completed profiles to Firestore
// Logo uploads to Firebase Storage
// Designed to be shared as a standalone link with lenders
//
// Route: /lender-intake (or /lender-intake/:token for pre-filled)
// Firestore collection: lenderIntakeSubmissions
// Storage path: lenderLogos/{sessionId}.{ext}
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { db, storage } from "../firebase/config";
import {
  collection, addDoc, doc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

// ── SESSION UUID ───────────────────────────────────────────
function generateSessionId() {
  return `li_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── FORM STEP DEFINITIONS ──────────────────────────────────

const LENDER_TYPES = [
  { id: "conventional", label: "Conventional / Agency", icon: "🏦" },
  { id: "nonqm",        label: "Non-QM / Alternative",  icon: "📊" },
  { id: "hard_money",   label: "Hard Money / Private / Bridge", icon: "🔥" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// ── INITIAL FORM STATE ─────────────────────────────────────

const initialState = {
  // Logo
  logoUrl: "",

  // Guidelines + Matrix uploads (PRD v3.1 §3 — Surface A pre-fill)
  guidelinesUrl: "",
  guidelinesFileName: "",
  guidelinesChecksum: "",
  guidelinesUploadedAt: null,
  guidelinesExtracted: null,
  matrixUrl: "",
  matrixFileName: "",
  matrixChecksum: "",
  matrixUploadedAt: null,
  matrixExtracted: null,

  // Category
  lenderType: "",

  // Section 1 — Basic Info (all types)
  lenderName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  lenderEntityType: "",
  statesLicensed: [],
  statesActive: [],
  pendingStateLicenses: [],
  acceptingNewBrokers: "",
  typicalFundingDays: "",
  dedicatedAEAssigned: "",
  aeContactName: "",
  aeContactEmail: "",
  aeContactPhone: "",
  escalationContactName: "",
  escalationContactEmail: "",
  thirdPartyProcessingAllowed: "",
  thirdPartyProcessingDetails: "",
  processingFeeCap: "",
  submissionPortal: "",
  scenarioDeskAvailable: "",
  scenarioDeskHours: "",
  overlappingLoanCap: "",
  affiliatedBusinessArrangements: "",
  inHouseUnderwriting: "",
  conditionTurnaroundDays: "",
  ruralAppraisalPolicy: "",

  // ── CONVENTIONAL FIELDS ──
  conv_ausAccepted: [],
  conv_minFICO_conventional: "",
  conv_minFICO_fha: "",
  conv_minFICO_va: "",
  conv_minFICO_usda: "",
  conv_maxDTI: "",
  conv_maxLTV_ownerOccupied: "",
  conv_maxLTV_secondHome: "",
  conv_maxLTV_investment: "",
  conv_conformingLimit: "",
  conv_highBalanceLimit: "",
  conv_jumboThreshold: "",
  conv_minReserves: "",
  conv_delegatedAuthority: "",
  conv_hmda: "",
  // Overlays
  conv_bkSeasoning: "",
  conv_foreclosureSeasoning: "",
  conv_selfEmployedRequirements: "",
  conv_nonWarrantableCondoPolicy: "",
  conv_manufacturedHome: "",
  conv_twoToFourUnit: "",
  conv_condotelPolicy: "",
  conv_giftFundRestrictions: "",
  conv_dpaAcceptance: "",
  // Niches
  conv_niches: {
    firstTimeHomebuyer: false, communityLending: false, doctorProfessional: false,
    constructionToPerm: false, oneTimeClose: false, renovation: false, highBalance: false,
    jumbo: false, bondDPA: false, manufactured: false, rural: false,
  },
  conv_nicheDetails: {},
  // Comp
  conv_srpRanges: "", conv_llpasApplied: "", conv_maxBrokerComp: "",
  conv_pricingExceptionProcess: "", conv_lockPeriods: "",
  conv_floatDownPolicy: "", conv_renegotiationPolicy: "",

  // ── NON-QM FIELDS ──
  nqm_minFICO_bankStatement: "",
  nqm_minFICO_dscr: "",
  nqm_minFICO_assetDepletion: "",
  nqm_minFICO_foreignNational: "",
  nqm_maxLoanAmount: "",
  nqm_secondaryMarket: "",
  nqm_prepaymentPenaltyOptions: "",
  // Products
  nqm_products: {
    bankStatement: false, plOnly: false, assetDepletion: false, dscr: false,
    tenNinetyNine: false, foreignNational: false, recentCreditEvents: false, interestOnly: false,
  },
  nqm_bankStatementDetails: "",
  nqm_plDetails: "",
  nqm_assetDepletionDetails: "",
  nqm_dscrDetails: "",
  nqm_tenNinetyNineDetails: "",
  nqm_foreignNationalDetails: "",
  nqm_recentCreditEventDetails: "",
  nqm_interestOnlyDetails: "",
  // Niches
  nqm_niches: {
    strAirbnbDSCR: false, mixedUseDSCR: false, multifamilyDSCR: false,
    highNetWorth: false, cryptoAssets: false, nearMissConventional: false,
    fixAndHold: false, firstTimeInvestor: false, condoNonWarrantable: false, commercialCrossover: false,
    bridgeLoan: false,
  },
  nqm_nicheDetails: {},
  // Comp
  nqm_parPricing: "", nqm_yspTiers: "", nqm_maxBrokerComp: "",
  nqm_creditEventPricingAdjustment: "", nqm_lockPolicies: "", nqm_renegotiationPolicy: "",

  // ── HARD MONEY FIELDS ──
  hm_maxLTVonARV: "", hm_maxLTVonPurchase: "", hm_minLoanAmount: "", hm_maxLoanAmount: "",
  hm_termsAvailable: [], hm_fastCloseCapable: "", hm_borrowerExperienceRequired: "",
  hm_entityRequired: "", hm_personalGuaranteeRequired: "", hm_crossCollateralization: "",
  hm_proofOfFundsLetter: "", hm_sameDayTermSheet: "", hm_rehabBudgetCapacity: "",
  hm_drawSchedule: "", hm_numberOfDraws: "", hm_drawTurnaroundDays: "",
  hm_buildersRisk: "", hm_vacantProperty: "", hm_liabilityMinimum: "",
  hm_propertyTypes: [], hm_extensionFee: "", hm_lenderPoints: "",
  hm_processingFee: "", hm_adminFee: "", hm_maxBrokerPoints: "",
  hm_brokerFeeStructure: [], hm_yspAvailable: "", hm_yspDetails: "",
  hm_totalFeeCap: "", hm_prepaymentPenalty: "",
  hm_niches: {
    fixAndFlip: false, groundUpConstruction: false, bridgeToPermanent: false,
    foreignNational: false, nonWarrantableCondo: false, landLoans: false,
    commercialMixedUse: false, fastCloseUnder10Days: false, portfolioRepeatBorrower: false, highLeverageRehab: false,
  },
  hm_nicheDetails: {},
  hm_preferredExitStrategies: [], hm_marketsActivelySought: "", hm_dealTypesToAvoid: "",
};

// ── MAIN COMPONENT ─────────────────────────────────────────

const LenderIntakeForm = ({ prefillToken }) => {
  const [sessionId] = useState(() => generateSessionId());
  const [formData, setFormData] = useState(initialState);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Logo upload state
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const [logoError, setLogoError] = useState("");

  // Guidelines PDF upload state (PRD v3.1 §3.1)
  const [guidelinesFile, setGuidelinesFile] = useState(null);
  const [guidelinesUploading, setGuidelinesUploading] = useState(false);
  const [guidelinesProgress, setGuidelinesProgress] = useState(0);
  const [guidelinesError, setGuidelinesError] = useState("");
  const [guidelinesExtracting, setGuidelinesExtracting] = useState(false);

  // Matrix / pricing PDF upload state (PRD v3.1 §3.4)
  const [matrixFile, setMatrixFile] = useState(null);
  const [matrixUploading, setMatrixUploading] = useState(false);
  const [matrixProgress, setMatrixProgress] = useState(0);
  const [matrixError, setMatrixError] = useState("");
  const [matrixExtracting, setMatrixExtracting] = useState(false);

  // Prefill from token
  useEffect(() => {
    if (!prefillToken) return;
    const fetchPrefill = async () => {
      try {
        const snap = await getDoc(doc(db, "lenderIntakePrefills", prefillToken));
        if (snap.exists()) {
          setFormData((prev) => ({ ...prev, ...snap.data() }));
        }
      } catch (e) {
        console.warn("Prefill fetch failed:", e);
      }
    };
    fetchPrefill();
  }, [prefillToken]);

  const getSteps = (type) => {
    if (type === "conventional") return ["type","basic_info","core_qual","overlays","niches_conv","comp_conv","operations","submission"];
    if (type === "nonqm")        return ["type","basic_info","core_qual_nqm","products","niches_nqm","comp_nqm","operations","submission"];
    if (type === "hard_money")   return ["type","basic_info","core_qual_hm","rehab","niches_hm","comp_hm","deal_prefs","operations","submission"];
    return ["type"];
  };

  const steps = getSteps(formData.lenderType);
  const totalSteps = steps.length;

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));
  const toggle = (section, key) =>
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], [key]: !prev[section][key] } }));
  const handleStateToggle = (field, state) =>
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(state) ? prev[field].filter((s) => s !== state) : [...prev[field], state],
    }));

  // ── LOGO UPLOAD HANDLER ──
  const handleLogoUpload = useCallback(async (file) => {
    if (!file) return;
    const validTypes = ["image/jpeg","image/jpg","image/png","image/svg+xml","image/webp"];
    if (!validTypes.includes(file.type)) {
      setLogoError("Please upload a JPG, PNG, SVG, or WebP file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Logo must be under 5MB.");
      return;
    }
    setLogoError("");
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const ext = file.name.split(".").pop();
      const storageRef = ref(storage, `lenderLogos/${sessionId}.${ext}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on(
        "state_changed",
        (snap) => setLogoUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => { setLogoError("Upload failed. Please try again."); setLogoUploading(false); console.error(err); },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          set("logoUrl", url);
          setLogoUploading(false);
          setLogoUploadProgress(100);
        }
      );
    } catch (err) {
      setLogoError("Upload failed. Please try again.");
      setLogoUploading(false);
    }
  }, [sessionId]);

  // ── SHA-256 (client-side — for version detection per PRD v3.1 §3.5) ──
  const computeSHA256 = async (file) => {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // ── PDF EXTRACTION (claude-haiku-4-5 direct API) ──
  const extractPDF = async (base64, docType, lenderType) => {
    const guidelinesPrompt = `You are a mortgage lending expert analyzing a lender's published guidelines, overlay memo, or program summary. The lender category is "${lenderType || "unspecified"}". Extract structured data from this PDF. Return ONLY valid JSON, no markdown fences, no preamble, matching this exact schema:

{
  "effectiveDate": "YYYY-MM-DD or null",
  "lenderName": "string or null",
  "lenderNMLS": "string or null",
  "documentType": "guidelines | overlay_memo | program_summary | term_sheet",
  "loanTypesCovered": ["list of loan types in document"],
  "overlays": {
    "minFICO": {"FHA": number_or_null, "Conventional": number_or_null, "VA": number_or_null, "USDA": number_or_null, "NonQM": number_or_null, "HardMoney": number_or_null},
    "maxDTI": {"FHA": number_or_null, "Conventional": number_or_null, "VA": number_or_null, "USDA": number_or_null},
    "maxLTV": {"purchase_primary": number_or_null, "rateterm": number_or_null, "cashout": number_or_null, "investment": number_or_null, "secondHome": number_or_null},
    "reservesRequired": "string or null",
    "bankruptcySeasoning": "string or null",
    "foreclosureSeasoning": "string or null",
    "selfEmployedDocRequirements": "string or null",
    "nonWarrantableCondoPolicy": "string or null",
    "manufacturedHomePolicy": "string or null",
    "ruralPropertyPolicy": "string or null"
  },
  "propertyTypesAccepted": ["list"],
  "occupancyTypesAccepted": ["list"],
  "statesLicensed": ["list of state abbreviations"],
  "specialPrograms": ["list of specialty programs identified"],
  "keyRestrictions": "string — notable overlays stricter than agency",
  "notes": "anything else material to LO placement decisions"
}

If a field is not in the PDF, use null. Do not infer values not present in the document.`;

    const matrixPrompt = `You are a mortgage lending expert. Extract ALL guideline and product data from this lender rate matrix, pricing sheet, fee schedule, or term sheet. The lender category is "${lenderType || "unspecified"}". Return ONLY valid JSON, no markdown fences, no preamble:
{
  "effectiveDate": "string or null",
  "lenderName": "string or null",
  "products": [{
    "name": "product name",
    "minFICO": number_or_null,
    "maxLTV": {"purchase": number_or_null, "rateterm": number_or_null, "cashout": number_or_null},
    "maxLoan": number_or_null,
    "minLoan": number_or_null,
    "prepay": "none|1yr|2yr|3yr|5yr|step-down or null",
    "interestOnly": true_or_false,
    "occupancy": ["owner","2ndhome","investment"],
    "propertyTypes": ["sfr","2-4unit","condo","townhome","5plus","commercial"],
    "dscrMin": number_or_null,
    "noRatioDSCR": true_or_false_or_null,
    "strAllowed": true_or_false_or_null,
    "bkSeasoning": "X months or null",
    "fcSeasoning": "X months or null",
    "ssSeasoning": "X months or null",
    "notes": "key restrictions or requirements"
  }],
  "llpas": [{"factor": "description", "adjustment": "+/-X.XXX"}],
  "generalNotes": "lender-wide requirements or special programs"
}

For Hard Money lenders: products[] should capture deal structures (Fix & Flip, Bridge, New Construction, etc.) with their LTV/ARV/rate/points/term parameters.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: docType === "guidelines" ? guidelinesPrompt : matrixPrompt },
          ],
        }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).find((b) => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  };

  // ── Shared PDF upload logic (parameterized by doc type + state setters) ──
  const uploadPDF = async (file, docType, storagePrefix, setters) => {
    const { setFile, setUploading, setProgress, setError, setExtracting } = setters;
    if (!file) return;
    if (file.type !== "application/pdf") { setError("PDF files only."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("File must be under 25MB."); return; }
    setError(""); setFile(file); setUploading(true); setProgress(0);
    try {
      const checksum = await computeSHA256(file);
      const storageRef = ref(storage, `lenderDocs/${sessionId}/${storagePrefix}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on(
        "state_changed",
        (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => { setError("Upload failed. Please try again."); setUploading(false); console.error(err); },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          set(`${storagePrefix}Url`, url);
          set(`${storagePrefix}FileName`, file.name);
          set(`${storagePrefix}Checksum`, checksum);
          set(`${storagePrefix}UploadedAt`, new Date().toISOString());
          setUploading(false); setProgress(100);
          // Kick off AI extraction (non-blocking — upload succeeds even if extraction fails)
          setExtracting(true);
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result.split(",")[1];
            try {
              const extracted = await extractPDF(base64, docType, formData.lenderType);
              set(`${storagePrefix}Extracted`, extracted);
            } catch (extractErr) {
              console.warn(`${docType} extraction failed (non-blocking):`, extractErr);
              set(`${storagePrefix}Extracted`, { error: "extraction_failed", message: String(extractErr) });
            } finally {
              setExtracting(false);
            }
          };
          reader.readAsDataURL(file);
        }
      );
    } catch (err) {
      setError("Upload failed. Please try again.");
      setUploading(false);
    }
  };

  const handleGuidelinesUpload = useCallback((file) => uploadPDF(file, "guidelines", "guidelines", {
    setFile: setGuidelinesFile, setUploading: setGuidelinesUploading, setProgress: setGuidelinesProgress,
    setError: setGuidelinesError, setExtracting: setGuidelinesExtracting,
  }), [sessionId, formData.lenderType]);

  const handleMatrixUpload = useCallback((file) => uploadPDF(file, "matrix", "matrix", {
    setFile: setMatrixFile, setUploading: setMatrixUploading, setProgress: setMatrixProgress,
    setError: setMatrixError, setExtracting: setMatrixExtracting,
  }), [sessionId, formData.lenderType]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, "lenderIntakeSubmissions"), {
        ...formData,
        sessionId,
        submittedAt: serverTimestamp(),
        status: "pending_review",
        sourceToken: prefillToken || null,
      });
      setSubmitted(true);
    } catch (err) {
      setError("Submission failed. Please try again or contact support.");
      console.error(err);
    }
    setSubmitting(false);
  };

  // Progress percentage
  const progressPct = currentStep > 0 ? Math.round((currentStep / (totalSteps - 1)) * 100) : 0;

  if (submitted) return <SuccessScreen lenderName={formData.lenderName} logoUrl={formData.logoUrl} />;

  return (
    <div style={styles.container}>
      {/* ── HEADER ── */}
      <div style={styles.header}>
        <div style={styles.logo}>LoanBeacons™</div>
        <div style={styles.headerTitle}>Lender Profile Intake</div>
        <div style={styles.headerSub}>
          Your information will be used to match you with the right loan scenarios on the LoanBeacons platform.
          All fields are self-reported and can be updated at any time.
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      {formData.lenderType && (
        <div style={styles.progressWrapper}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
            </div>
            <span style={styles.progressPct}>{progressPct}%</span>
          </div>
          <span style={styles.progressLabel}>Step {currentStep} of {totalSteps - 1}</span>
        </div>
      )}

      {/* ── FORM BODY ── */}
      <div style={styles.body}>

        {/* ────────────────────────────────────────────────── */}
        {/* STEP 0: LENDER TYPE SELECTION                     */}
        {/* ────────────────────────────────────────────────── */}
        {currentStep === 0 && (
          <FormSection title="What type of lender are you?" subtitle="Select the category that best describes your lending operation">
            <div style={styles.typeGrid}>
              {LENDER_TYPES.map((type) => (
                <div
                  key={type.id}
                  onClick={() => { set("lenderType", type.id); setCurrentStep(1); }}
                  style={{
                    ...styles.typeCard,
                    borderColor: formData.lenderType === type.id ? "#e8531a" : "#2d3548",
                    background: formData.lenderType === type.id ? "#e8531a14" : "#1a1f2e",
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "14px" }}>{type.icon}</div>
                  <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "15px" }}>{type.label}</div>
                </div>
              ))}
            </div>
          </FormSection>
        )}

        {/* ────────────────────────────────────────────────── */}
        {/* STEP 1: BASIC INFO (all types)                    */}
        {/* ────────────────────────────────────────────────── */}
        {currentStep === 1 && (
          <FormSection title="Basic Information" subtitle="Tell us about your organization, primary contact, and brand">

            {/* ── LOGO UPLOAD ── */}
            <div style={{ marginBottom: "28px" }}>
              <Label>Company Logo</Label>
              <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "10px" }}>
                Used to identify your organization in the LoanBeacons Lender Library. JPG, PNG, SVG or WebP — max 5MB. Recommended: square or landscape, min 200×80px.
              </div>
              <DragDropLogo
                preview={logoPreview}
                uploading={logoUploading}
                progress={logoUploadProgress}
                error={logoError}
                onFile={handleLogoUpload}
                onRemove={() => { setLogoPreview(""); setLogoFile(null); set("logoUrl", ""); setLogoUploadProgress(0); }}
              />
            </div>

            {/* ── GUIDELINES + MATRIX UPLOAD (PRD v3.1 §3 — Surface A pre-fill) ── */}
            <div style={{ marginBottom: "28px" }}>
              <Label>Lender Guidelines &amp; Rate Matrix (Optional)</Label>
              <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "10px" }}>
                Upload your published guidelines and rate matrix. Claude AI will read both PDFs and pre-populate structured data for LoanBeacons Admin to review. Your original files are preserved alongside the extracted data. Accepted: PDF, max 25MB each.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <DragDropPDF
                  title="Lender Guidelines"
                  subtitle="Published guidelines, overlay memo, or program summary"
                  icon="📋"
                  filename={formData.guidelinesFileName}
                  uploading={guidelinesUploading}
                  progress={guidelinesProgress}
                  extracting={guidelinesExtracting}
                  extracted={formData.guidelinesExtracted}
                  error={guidelinesError}
                  onFile={handleGuidelinesUpload}
                  onRemove={() => {
                    setGuidelinesFile(null); setGuidelinesProgress(0);
                    set("guidelinesUrl", ""); set("guidelinesFileName", "");
                    set("guidelinesChecksum", ""); set("guidelinesUploadedAt", null);
                    set("guidelinesExtracted", null);
                  }}
                />
                <DragDropPDF
                  title={
                    formData.lenderType === "hard_money" ? "Fee Schedule / Term Sheet" :
                    formData.lenderType === "nonqm" ? "Rate Matrix / Product Spec" :
                    "Rate Sheet / Pricing Matrix"
                  }
                  subtitle={
                    formData.lenderType === "hard_money" ? "Points, rates, fees, deal structure" :
                    formData.lenderType === "nonqm" ? "DSCR, bank stmt, LLPAs, prepay" :
                    "Par rates, LLPAs, comp tiers"
                  }
                  icon="📊"
                  filename={formData.matrixFileName}
                  uploading={matrixUploading}
                  progress={matrixProgress}
                  extracting={matrixExtracting}
                  extracted={formData.matrixExtracted}
                  error={matrixError}
                  onFile={handleMatrixUpload}
                  onRemove={() => {
                    setMatrixFile(null); setMatrixProgress(0);
                    set("matrixUrl", ""); set("matrixFileName", "");
                    set("matrixChecksum", ""); set("matrixUploadedAt", null);
                    set("matrixExtracted", null);
                  }}
                />
              </div>
            </div>

            <Grid2>
              <Field label="Lender / Company Name *" value={formData.lenderName} onChange={(v) => set("lenderName", v)} placeholder="e.g. Apex Bridge Capital" />
              <Field label="Primary Contact Name *" value={formData.contactName} onChange={(v) => set("contactName", v)} placeholder="Full name" />
              <Field label="Contact Email *" value={formData.contactEmail} onChange={(v) => set("contactEmail", v)} type="email" placeholder="email@company.com" />
              <Field label="Contact Phone" value={formData.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="(555) 000-0000" />
              <Select
                label="Lender Entity Type *"
                value={formData.lenderEntityType}
                onChange={(v) => set("lenderEntityType", v)}
                options={lenderEntityOptions(formData.lenderType)}
              />
              <Field label="Typical Funding / Turn Time (days) *" value={formData.typicalFundingDays} onChange={(v) => set("typicalFundingDays", v)} type="number" placeholder="e.g. 7" />
            </Grid2>

            <RadioGroup
              label="Are you currently accepting new brokers? *"
              value={formData.acceptingNewBrokers}
              onChange={(v) => set("acceptingNewBrokers", v)}
              options={["Yes", "No", "Case by Case"]}
            />

            <StateSelector
              label="States Licensed *"
              selected={formData.statesLicensed}
              onToggle={(s) => handleStateToggle("statesLicensed", s)}
            />
            <StateSelector
              label="States Currently Active (lending now)"
              selected={formData.statesActive}
              onToggle={(s) => handleStateToggle("statesActive", s)}
              note="Select only states where you are actively taking new submissions"
            />
            <StateSelector
              label="Pending State Licenses (applied, not yet approved)"
              selected={formData.pendingStateLicenses}
              onToggle={(s) => handleStateToggle("pendingStateLicenses", s)}
              note="Optional — helps LOs plan ahead for future submissions"
            />
          </FormSection>
        )}

        {/* ────────────────────────────────────────────────── */}
        {/* CONVENTIONAL — CORE QUAL                          */}
        {/* ────────────────────────────────────────────────── */}
        {formData.lenderType === "conventional" && currentStep === 2 && (
          <FormSection title="Core Qualification Criteria" subtitle="Your minimum qualification standards">
            <div style={{ marginBottom: "20px" }}>
              <Label>AUS Accepted</Label>
              <CheckboxRow
                items={["DU (Desktop Underwriter)", "LP (Loan Product Advisor)", "Both"]}
                selected={formData.conv_ausAccepted}
                onToggle={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    conv_ausAccepted: prev.conv_ausAccepted.includes(v)
                      ? prev.conv_ausAccepted.filter((i) => i !== v)
                      : [...prev.conv_ausAccepted, v],
                  }))
                }
              />
            </div>

            <SectionSubhead>Minimum FICO by Loan Type</SectionSubhead>
            <Grid4>
              <Field label="Conventional" value={formData.conv_minFICO_conventional} onChange={(v) => set("conv_minFICO_conventional", v)} type="number" placeholder="620" />
              <Field label="FHA" value={formData.conv_minFICO_fha} onChange={(v) => set("conv_minFICO_fha", v)} type="number" placeholder="580" />
              <Field label="VA" value={formData.conv_minFICO_va} onChange={(v) => set("conv_minFICO_va", v)} type="number" placeholder="580" />
              <Field label="USDA" value={formData.conv_minFICO_usda} onChange={(v) => set("conv_minFICO_usda", v)} type="number" placeholder="640" />
            </Grid4>

            <SectionSubhead>Max LTV by Occupancy</SectionSubhead>
            <Grid4>
              <Field label="Owner Occupied" value={formData.conv_maxLTV_ownerOccupied} onChange={(v) => set("conv_maxLTV_ownerOccupied", v)} suffix="%" placeholder="97" />
              <Field label="Second Home" value={formData.conv_maxLTV_secondHome} onChange={(v) => set("conv_maxLTV_secondHome", v)} suffix="%" placeholder="90" />
              <Field label="Investment" value={formData.conv_maxLTV_investment} onChange={(v) => set("conv_maxLTV_investment", v)} suffix="%" placeholder="85" />
              <Field label="Max DTI" value={formData.conv_maxDTI} onChange={(v) => set("conv_maxDTI", v)} suffix="%" placeholder="50" />
            </Grid4>

            <SectionSubhead>Loan Limits</SectionSubhead>
            <Grid4>
              <Field label="Conforming Limit" value={formData.conv_conformingLimit} onChange={(v) => set("conv_conformingLimit", v)} prefix="$" placeholder="806,500" />
              <Field label="High-Balance Limit" value={formData.conv_highBalanceLimit} onChange={(v) => set("conv_highBalanceLimit", v)} prefix="$" placeholder="Market-specific" />
              <Field label="Jumbo Threshold" value={formData.conv_jumboThreshold} onChange={(v) => set("conv_jumboThreshold", v)} prefix="$" />
              <Field label="Min Reserves (months)" value={formData.conv_minReserves} onChange={(v) => set("conv_minReserves", v)} type="number" placeholder="2" />
            </Grid4>

            <Grid2>
              <RadioGroup label="Delegated Underwriting Authority" value={formData.conv_delegatedAuthority} onChange={(v) => set("conv_delegatedAuthority", v)} options={["Full Delegation", "Limited Delegation", "Non-Delegated Only"]} />
              <RadioGroup label="HMDA Reporting" value={formData.conv_hmda} onChange={(v) => set("conv_hmda", v)} options={["Yes", "No"]} inline />
            </Grid2>
          </FormSection>
        )}

        {/* CONVENTIONAL — OVERLAYS */}
        {formData.lenderType === "conventional" && currentStep === 3 && (
          <FormSection title="Overlays & Restrictions" subtitle="Where your guidelines are stricter than agency guidelines">
            <Grid2>
              <Field label="Bankruptcy Seasoning (months)" value={formData.conv_bkSeasoning} onChange={(v) => set("conv_bkSeasoning", v)} type="number" placeholder="Agency standard if blank" />
              <Field label="Foreclosure Seasoning (months)" value={formData.conv_foreclosureSeasoning} onChange={(v) => set("conv_foreclosureSeasoning", v)} type="number" />
            </Grid2>
            <Textarea label="Self-Employed Income Requirements (if stricter than agency)" value={formData.conv_selfEmployedRequirements} onChange={(v) => set("conv_selfEmployedRequirements", v)} />
            <Textarea label="Non-Warrantable Condo Policy" value={formData.conv_nonWarrantableCondoPolicy} onChange={(v) => set("conv_nonWarrantableCondoPolicy", v)} />
            <Textarea label="Condotel Policy" value={formData.conv_condotelPolicy} onChange={(v) => set("conv_condotelPolicy", v)} placeholder="Describe condotel eligibility or restrictions, or leave blank if not accepted" />
            <Grid2>
              <RadioGroup label="Manufactured Home" value={formData.conv_manufacturedHome} onChange={(v) => set("conv_manufacturedHome", v)} options={["Accepted", "Not Accepted", "Case by Case"]} />
              <RadioGroup label="2–4 Unit Properties" value={formData.conv_twoToFourUnit} onChange={(v) => set("conv_twoToFourUnit", v)} options={["Accepted", "Not Accepted", "Overlays Apply"]} />
            </Grid2>
            <Textarea label="Gift Fund Restrictions (if any)" value={formData.conv_giftFundRestrictions} onChange={(v) => set("conv_giftFundRestrictions", v)} placeholder="Leave blank if no restrictions beyond agency guidelines" />
            <RadioGroup label="Down Payment Assistance Programs Accepted" value={formData.conv_dpaAcceptance} onChange={(v) => set("conv_dpaAcceptance", v)} options={["Yes — All DPA", "Yes — Approved List Only", "No"]} />
          </FormSection>
        )}

        {/* CONVENTIONAL — NICHES */}
        {formData.lenderType === "conventional" && currentStep === 4 && (
          <FormSection title="Product Niches" subtitle="Check all that apply — then describe your specific parameters for each">
            <NicheGrid
              niches={[
                { key: "firstTimeHomebuyer", label: "First-Time Homebuyer Programs" },
                { key: "communityLending",   label: "Community Lending / CRA Products" },
                { key: "doctorProfessional", label: "Doctor / Professional Loans" },
                { key: "constructionToPerm", label: "Construction-to-Perm (Two-Time Close)" },
                { key: "oneTimeClose",       label: "One-Time Close (OTC) — FHA · VA · USDA · Conventional" },
                { key: "renovation",         label: "Renovation (203k, HomeStyle, CHOICERenovation)" },
                { key: "highBalance",        label: "High-Balance Specialty" },
                { key: "jumbo",              label: "Jumbo (describe where guidelines diverge)" },
                { key: "bondDPA",            label: "Bond / DPA Program Acceptance" },
                { key: "manufactured",       label: "Manufactured / Modular" },
                { key: "rural",              label: "Rural Properties" },
              ]}
              selected={formData.conv_niches}
              details={formData.conv_nicheDetails}
              onToggle={(key) => toggle("conv_niches", key)}
              onDetail={(key, value) => setFormData((prev) => ({ ...prev, conv_nicheDetails: { ...prev.conv_nicheDetails, [key]: value } }))}
            />
          </FormSection>
        )}

        {/* CONVENTIONAL — COMP */}
        {formData.lenderType === "conventional" && currentStep === 5 && (
          <FormSection title="Pricing & Compensation" subtitle="How brokers are compensated on your loans">
            <Textarea label="Base Pricing / Par Rate Tiers" value={formData.conv_srpRanges} onChange={(v) => set("conv_srpRanges", v)} placeholder="Describe your par pricing structure or SRP ranges" />
            <Textarea label="LLPAs Applied (notable ones)" value={formData.conv_llpasApplied} onChange={(v) => set("conv_llpasApplied", v)} placeholder="e.g. FICO below 680 investment = +1.5 LLPA" />
            <Grid2>
              <Field label="Max Broker Comp Allowed" value={formData.conv_maxBrokerComp} onChange={(v) => set("conv_maxBrokerComp", v)} placeholder="e.g. 2.75%" />
              <Field label="Lock Periods Available" value={formData.conv_lockPeriods} onChange={(v) => set("conv_lockPeriods", v)} placeholder="e.g. 15, 30, 45, 60 days" />
            </Grid2>
            <Grid2>
              <Textarea label="Pricing Exception Process" value={formData.conv_pricingExceptionProcess} onChange={(v) => set("conv_pricingExceptionProcess", v)} placeholder="Can your AE reprice? Turnaround time?" />
              <Textarea label="Float Down Policy" value={formData.conv_floatDownPolicy} onChange={(v) => set("conv_floatDownPolicy", v)} />
            </Grid2>
            <Textarea label="Renegotiation Policy" value={formData.conv_renegotiationPolicy} onChange={(v) => set("conv_renegotiationPolicy", v)} placeholder="Under what conditions can a rate be renegotiated?" />
          </FormSection>
        )}

        {/* ────────────────────────────────────────────────── */}
        {/* NON-QM — CORE QUAL                                */}
        {/* ────────────────────────────────────────────────── */}
        {formData.lenderType === "nonqm" && currentStep === 2 && (
          <FormSection title="Core Qualification Criteria" subtitle="Your minimum standards by product">
            <SectionSubhead>Minimum FICO by Product</SectionSubhead>
            <Grid4>
              <Field label="Bank Statement" value={formData.nqm_minFICO_bankStatement} onChange={(v) => set("nqm_minFICO_bankStatement", v)} type="number" placeholder="620" />
              <Field label="DSCR" value={formData.nqm_minFICO_dscr} onChange={(v) => set("nqm_minFICO_dscr", v)} type="number" placeholder="620" />
              <Field label="Asset Depletion" value={formData.nqm_minFICO_assetDepletion} onChange={(v) => set("nqm_minFICO_assetDepletion", v)} type="number" placeholder="660" />
              <Field label="Foreign National" value={formData.nqm_minFICO_foreignNational} onChange={(v) => set("nqm_minFICO_foreignNational", v)} type="number" placeholder="N/A if no US credit" />
            </Grid4>
            <Grid2>
              <Field label="Max Loan Amount" value={formData.nqm_maxLoanAmount} onChange={(v) => set("nqm_maxLoanAmount", v)} prefix="$" placeholder="3,000,000" />
              <RadioGroup label="Secondary Market" value={formData.nqm_secondaryMarket} onChange={(v) => set("nqm_secondaryMarket", v)} options={["Securitize", "Portfolio", "Both"]} />
            </Grid2>
            <Textarea label="Prepayment Penalty Options" value={formData.nqm_prepaymentPenaltyOptions} onChange={(v) => set("nqm_prepaymentPenaltyOptions", v)} placeholder="e.g. 3/2/1, 5 year step, no prepay available" />
          </FormSection>
        )}

        {/* NON-QM — PRODUCTS */}
        {formData.lenderType === "nonqm" && currentStep === 3 && (
          <FormSection title="Product Availability" subtitle="Check all products you offer, then provide specific parameters for each">
            <NicheGrid
              niches={[
                { key: "bankStatement",      label: "Bank Statement",                          placeholder: "e.g. 12mo/24mo, personal/business, expense factor, max LTV" },
                { key: "plOnly",             label: "P&L Only",                               placeholder: "e.g. CPA required, time period, max LTV" },
                { key: "assetDepletion",     label: "Asset Depletion / Asset Utilization",    placeholder: "e.g. formula used, eligible asset types" },
                { key: "dscr",               label: "DSCR",                                   placeholder: "e.g. min DSCR ratio, no-ratio option, STR income acceptance" },
                { key: "tenNinetyNine",      label: "1099 Only",                              placeholder: "e.g. 12mo or 24mo, industries accepted" },
                { key: "foreignNational",    label: "Foreign National",                       placeholder: "e.g. ITIN accepted, visa types, credit alternative requirements" },
                { key: "recentCreditEvents", label: "Recent Credit Events (BK, FC, SS)",      placeholder: "e.g. BK accepted at 12mo, LTV/rate adjustment" },
                { key: "interestOnly",       label: "Interest Only",                          placeholder: "e.g. available on which products, IO period length" },
              ]}
              selected={formData.nqm_products}
              // ✅ FIXED: pass correct details map instead of entire formData
              details={{
                bankStatement:      formData.nqm_bankStatementDetails,
                plOnly:             formData.nqm_plDetails,
                assetDepletion:     formData.nqm_assetDepletionDetails,
                dscr:               formData.nqm_dscrDetails,
                tenNinetyNine:      formData.nqm_tenNinetyNineDetails,
                foreignNational:    formData.nqm_foreignNationalDetails,
                recentCreditEvents: formData.nqm_recentCreditEventDetails,
                interestOnly:       formData.nqm_interestOnlyDetails,
              }}
              onToggle={(key) => toggle("nqm_products", key)}
              onDetail={(key, value) => {
                const fieldMap = {
                  bankStatement: "nqm_bankStatementDetails", plOnly: "nqm_plDetails",
                  assetDepletion: "nqm_assetDepletionDetails", dscr: "nqm_dscrDetails",
                  tenNinetyNine: "nqm_tenNinetyNineDetails", foreignNational: "nqm_foreignNationalDetails",
                  recentCreditEvents: "nqm_recentCreditEventDetails", interestOnly: "nqm_interestOnlyDetails",
                };
                set(fieldMap[key], value);
              }}
            />
          </FormSection>
        )}

        {/* NON-QM — NICHES */}
        {formData.lenderType === "nonqm" && currentStep === 4 && (
          <FormSection title="Product Niches" subtitle="Specialized programs that differentiate your Non-QM offering">
            <NicheGrid
              niches={[
                { key: "strAirbnbDSCR",       label: "Short-Term Rental / Airbnb DSCR" },
                { key: "mixedUseDSCR",         label: "Mixed-Use DSCR" },
                { key: "multifamilyDSCR",      label: "Multi-Family DSCR (5–10 units)" },
                { key: "highNetWorth",         label: "High-Net-Worth / Asset-Based" },
                { key: "cryptoAssets",         label: "Crypto Asset Acceptance" },
                { key: "nearMissConventional", label: "Near-Miss Conventional" },
                { key: "fixAndHold",           label: "Fix-and-Hold Investor" },
                { key: "firstTimeInvestor",    label: "First-Time Investor Programs" },
                { key: "condoNonWarrantable",  label: "Condo / Non-Warrantable Condo" },
                { key: "commercialCrossover",  label: "Commercial Property Crossover" },
                { key: "bridgeLoan",           label: "Bridge Loan — Short-Term Acquisition / Refi" },
              ]}
              selected={formData.nqm_niches}
              details={formData.nqm_nicheDetails}
              onToggle={(key) => toggle("nqm_niches", key)}
              onDetail={(key, value) => setFormData((prev) => ({ ...prev, nqm_nicheDetails: { ...prev.nqm_nicheDetails, [key]: value } }))}
            />
          </FormSection>
        )}

        {/* NON-QM — COMP */}
        {formData.lenderType === "nonqm" && currentStep === 5 && (
          <FormSection title="Pricing & Compensation" subtitle="How brokers are compensated by product">
            <Textarea label="Par Pricing by Product" value={formData.nqm_parPricing} onChange={(v) => set("nqm_parPricing", v)} placeholder="Describe par rate structure for each product you offer" />
            <Textarea label="YSP / Backend Premium Tiers" value={formData.nqm_yspTiers} onChange={(v) => set("nqm_yspTiers", v)} placeholder="e.g. 0.5% YSP at +1% above par, 1% YSP at +2% above par" />
            <Grid2>
              <Field label="Max Broker Comp by Product" value={formData.nqm_maxBrokerComp} onChange={(v) => set("nqm_maxBrokerComp", v)} placeholder="e.g. 2.5% across all products" />
              <Textarea label="Pricing Adjustment for Credit Events" value={formData.nqm_creditEventPricingAdjustment} onChange={(v) => set("nqm_creditEventPricingAdjustment", v)} />
            </Grid2>
            <Textarea label="Lock Policies" value={formData.nqm_lockPolicies} onChange={(v) => set("nqm_lockPolicies", v)} />
            <Textarea label="Renegotiation Policy" value={formData.nqm_renegotiationPolicy} onChange={(v) => set("nqm_renegotiationPolicy", v)} placeholder="Under what conditions can a rate be renegotiated?" />
          </FormSection>
        )}

        {/* ────────────────────────────────────────────────── */}
        {/* HARD MONEY — CORE QUAL                            */}
        {/* ────────────────────────────────────────────────── */}
        {formData.lenderType === "hard_money" && currentStep === 2 && (
          <FormSection title="Core Qualification Criteria" subtitle="ARV and equity — the primary qualification levers">
            <SectionSubhead>LTV Parameters</SectionSubhead>
            <Grid4>
              <Field label="Max LTV on ARV *" value={formData.hm_maxLTVonARV} onChange={(v) => set("hm_maxLTVonARV", v)} suffix="%" placeholder="70" />
              <Field label="Max LTV on Purchase Price" value={formData.hm_maxLTVonPurchase} onChange={(v) => set("hm_maxLTVonPurchase", v)} suffix="%" placeholder="85" />
              <Field label="Min Loan Amount" value={formData.hm_minLoanAmount} onChange={(v) => set("hm_minLoanAmount", v)} prefix="$" placeholder="100,000" />
              <Field label="Max Loan Amount" value={formData.hm_maxLoanAmount} onChange={(v) => set("hm_maxLoanAmount", v)} prefix="$" placeholder="5,000,000" />
            </Grid4>

            <SectionSubhead>Loan Terms Available</SectionSubhead>
            <CheckboxRow
              items={["6 months","12 months","18 months","24 months","36 months"]}
              selected={formData.hm_termsAvailable}
              onToggle={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  hm_termsAvailable: prev.hm_termsAvailable.includes(v)
                    ? prev.hm_termsAvailable.filter((i) => i !== v)
                    : [...prev.hm_termsAvailable, v],
                }))
              }
            />

            <Grid2>
              <RadioGroup label="Fast Close Capable (under 10 days)" value={formData.hm_fastCloseCapable} onChange={(v) => set("hm_fastCloseCapable", v)} options={["Yes","No"]} inline />
              <RadioGroup label="Same-Day Term Sheet Available" value={formData.hm_sameDayTermSheet} onChange={(v) => set("hm_sameDayTermSheet", v)} options={["Yes","No"]} inline />
              <RadioGroup label="Proof of Funds Letter Available" value={formData.hm_proofOfFundsLetter} onChange={(v) => set("hm_proofOfFundsLetter", v)} options={["Yes","No"]} inline />
              <RadioGroup label="Cross-Collateralization Allowed" value={formData.hm_crossCollateralization} onChange={(v) => set("hm_crossCollateralization", v)} options={["Yes","No"]} inline />
              <RadioGroup label="Personal Guarantee Required" value={formData.hm_personalGuaranteeRequired} onChange={(v) => set("hm_personalGuaranteeRequired", v)} options={["Yes","No","Case by Case"]} />
            </Grid2>

            <Grid2>
              <Select
                label="Borrower Experience Required"
                value={formData.hm_borrowerExperienceRequired}
                onChange={(v) => set("hm_borrowerExperienceRequired", v)}
                options={[
                  { value: "none",     label: "None — first-time investors welcome" },
                  { value: "some",     label: "Some — prior deal or two preferred" },
                  { value: "seasoned", label: "Seasoned — multiple completed projects required" },
                ]}
              />
              <Select
                label="Entity Requirement"
                value={formData.hm_entityRequired}
                onChange={(v) => set("hm_entityRequired", v)}
                options={[
                  { value: "LLC_required",  label: "LLC required" },
                  { value: "LLC_preferred", label: "LLC preferred, personal OK" },
                  { value: "personal_ok",   label: "Personal vesting acceptable" },
                ]}
              />
            </Grid2>

            <SectionSubhead>Property Types Accepted</SectionSubhead>
            <CheckboxRow
              items={["SFR","2-4 Unit","Multifamily 5+","Commercial","Mixed Use","Condo","Non-Warrantable Condo","Townhome","Industrial","Office/Retail","Land (entitled)"]}
              selected={formData.hm_propertyTypes}
              onToggle={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  hm_propertyTypes: prev.hm_propertyTypes.includes(v)
                    ? prev.hm_propertyTypes.filter((i) => i !== v)
                    : [...prev.hm_propertyTypes, v],
                }))
              }
            />
          </FormSection>
        )}

        {/* HARD MONEY — REHAB */}
        {formData.lenderType === "hard_money" && currentStep === 3 && (
          <FormSection title="Rehab & Construction Parameters" subtitle="Your capacity and structure for rehabilitation and construction deals">
            <Grid2>
              <Field label="Max Rehab Budget Capacity" value={formData.hm_rehabBudgetCapacity} onChange={(v) => set("hm_rehabBudgetCapacity", v)} prefix="$" placeholder="2,000,000" />
              <RadioGroup label="Draw Schedule Available" value={formData.hm_drawSchedule} onChange={(v) => set("hm_drawSchedule", v)} options={["Yes","No"]} inline />
            </Grid2>
            {formData.hm_drawSchedule === "Yes" && (
              <Grid2>
                <Field label="Number of Draws" value={formData.hm_numberOfDraws} onChange={(v) => set("hm_numberOfDraws", v)} type="number" placeholder="5" />
                <Field label="Draw Turnaround (days)" value={formData.hm_drawTurnaroundDays} onChange={(v) => set("hm_drawTurnaroundDays", v)} type="number" placeholder="3" />
              </Grid2>
            )}
            <SectionSubhead>Insurance Requirements</SectionSubhead>
            <Grid2>
              <RadioGroup label="Builder's Risk Required" value={formData.hm_buildersRisk} onChange={(v) => set("hm_buildersRisk", v)} options={["Yes","No"]} inline />
              <RadioGroup label="Vacant Property Policy Required" value={formData.hm_vacantProperty} onChange={(v) => set("hm_vacantProperty", v)} options={["Yes","No"]} inline />
            </Grid2>
            <Grid2>
              <Field label="Minimum Liability Coverage" value={formData.hm_liabilityMinimum} onChange={(v) => set("hm_liabilityMinimum", v)} prefix="$" placeholder="1,000,000" />
              <Field label="Extension Fee" value={formData.hm_extensionFee} onChange={(v) => set("hm_extensionFee", v)} placeholder="e.g. 1% per extension" />
            </Grid2>
          </FormSection>
        )}

        {/* HARD MONEY — NICHES */}
        {formData.lenderType === "hard_money" && currentStep === 4 && (
          <FormSection title="Product Niches" subtitle="Your specialties — describe specific terms or requirements for each niche you check">
            <NicheGrid
              niches={[
                { key: "fixAndFlip",             label: "Fix & Flip Specialist",                     placeholder: "e.g. first-time OK, max % of purchase + rehab, how you calculate max offer" },
                { key: "groundUpConstruction",   label: "Ground-Up Construction",                   placeholder: "e.g. experience required, shovel-ready only, lot requirements" },
                { key: "bridgeToPermanent",      label: "Bridge-to-Permanent",                      placeholder: "e.g. exit options, partner lenders, seasoning on bridge-to-DSCR" },
                { key: "foreignNational",        label: "Foreign National Programs",                placeholder: "e.g. ITIN, passport, foreign bank statements, visa types" },
                { key: "nonWarrantableCondo",    label: "Non-Warrantable Condo",                    placeholder: "Describe how you handle non-warrantable condo eligibility" },
                { key: "landLoans",              label: "Land Loans",                               placeholder: "e.g. entitled land only, lot size limits, states" },
                { key: "commercialMixedUse",     label: "Commercial / Mixed-Use",                   placeholder: "e.g. max units, commercial use %, states" },
                { key: "fastCloseUnder10Days",   label: "Fast Close (Under 10 Days)",               placeholder: "What enables the fast close? Requirements?" },
                { key: "portfolioRepeatBorrower",label: "Portfolio / Repeat Borrower Program",      placeholder: "e.g. pricing benefits, streamlined docs, dedicated contact" },
                { key: "highLeverageRehab",      label: "High-Leverage Rehab (90%+ purchase + 100% rehab)", placeholder: "e.g. max ARV LTV, borrower requirements, deal size limits" },
              ]}
              selected={formData.hm_niches}
              details={formData.hm_nicheDetails}
              onToggle={(key) => toggle("hm_niches", key)}
              onDetail={(key, value) => setFormData((prev) => ({ ...prev, hm_nicheDetails: { ...prev.hm_nicheDetails, [key]: value } }))}
            />
          </FormSection>
        )}

        {/* HARD MONEY — COMP */}
        {formData.lenderType === "hard_money" && currentStep === 5 && (
          <FormSection title="Fees, Points & Compensation" subtitle="Full transparency on what borrowers pay and what brokers earn">
            <SectionSubhead>Lender Charges</SectionSubhead>
            <Grid4>
              <Field label="Lender Origination Points (min)" value={formData.hm_lenderPoints} onChange={(v) => set("hm_lenderPoints", v)} placeholder="e.g. 2-3" />
              <Field label="Processing Fee" value={formData.hm_processingFee} onChange={(v) => set("hm_processingFee", v)} prefix="$" placeholder="995" />
              <Field label="Admin Fee" value={formData.hm_adminFee} onChange={(v) => set("hm_adminFee", v)} prefix="$" placeholder="0" />
              <Field label="Extension Fee" value={formData.hm_extensionFee} onChange={(v) => set("hm_extensionFee", v)} placeholder="1% per extension" />
            </Grid4>

            <SectionSubhead>Broker Compensation</SectionSubhead>
            <Grid2>
              <Field label="Max Broker Points Allowed" value={formData.hm_maxBrokerPoints} onChange={(v) => set("hm_maxBrokerPoints", v)} type="number" placeholder="3" />
              <Field label="Total Fee Cap (lender + broker combined)" value={formData.hm_totalFeeCap} onChange={(v) => set("hm_totalFeeCap", v)} suffix="%" placeholder="Leave blank if no cap" />
            </Grid2>

            <SectionSubhead>Broker Fee Structure Allowed</SectionSubhead>
            <CheckboxRow
              items={["Points","Flat Fee","Both"]}
              selected={formData.hm_brokerFeeStructure}
              onToggle={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  hm_brokerFeeStructure: prev.hm_brokerFeeStructure.includes(v)
                    ? prev.hm_brokerFeeStructure.filter((i) => i !== v)
                    : [...prev.hm_brokerFeeStructure, v],
                }))
              }
            />

            <Grid2>
              <RadioGroup label="YSP / Backend Broker Premium Available" value={formData.hm_yspAvailable} onChange={(v) => set("hm_yspAvailable", v)} options={["Yes","No"]} inline />
            </Grid2>
            {formData.hm_yspAvailable === "Yes" && (
              <Textarea label="YSP Structure Details" value={formData.hm_yspDetails} onChange={(v) => set("hm_yspDetails", v)} placeholder="e.g. 0.5% YSP at +1% above par rate, 1% at +2%" />
            )}
            <Field label="Prepayment Penalty" value={formData.hm_prepaymentPenalty} onChange={(v) => set("hm_prepaymentPenalty", v)} placeholder="None, or describe structure" />
          </FormSection>
        )}

        {/* HARD MONEY — DEAL PREFS */}
        {formData.lenderType === "hard_money" && currentStep === 6 && (
          <FormSection title="Deal Preferences" subtitle="Help loan officers understand what kinds of deals you want">
            <SectionSubhead>Preferred Exit Strategies (check all you accept)</SectionSubhead>
            <CheckboxRow
              items={["Refinance to permanent","Sale of property","Construction-to-permanent loan"]}
              selected={formData.hm_preferredExitStrategies}
              onToggle={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  hm_preferredExitStrategies: prev.hm_preferredExitStrategies.includes(v)
                    ? prev.hm_preferredExitStrategies.filter((i) => i !== v)
                    : [...prev.hm_preferredExitStrategies, v],
                }))
              }
            />
            <Textarea label="Markets You're Actively Seeking Deals In" value={formData.hm_marketsActivelySought} onChange={(v) => set("hm_marketsActivelySought", v)} placeholder="e.g. DFW Texas, South Florida, Phoenix MSA" />
            <Textarea label="Deal Types You Want to Avoid" value={formData.hm_dealTypesToAvoid} onChange={(v) => set("hm_dealTypesToAvoid", v)} placeholder="e.g. raw land, gas stations, first-time investors over $1M" />
          </FormSection>
        )}

        {/* ────────────────────────────────────────────────── */}
        {/* OPERATIONS (all types — second-to-last step)      */}
        {/* ────────────────────────────────────────────────── */}
        {currentStep === steps.length - 2 && (
          <FormSection title="Operations & Submission Details" subtitle="How loan officers should work with you">
            <Grid2>
              <RadioGroup label="Dedicated AE Assigned to Brokers" value={formData.dedicatedAEAssigned} onChange={(v) => set("dedicatedAEAssigned", v)} options={["Yes","No"]} inline />
            </Grid2>
            {formData.dedicatedAEAssigned === "Yes" && (
              <Grid2>
                <Field label="AE Name" value={formData.aeContactName} onChange={(v) => set("aeContactName", v)} />
                <Field label="AE Email" value={formData.aeContactEmail} onChange={(v) => set("aeContactEmail", v)} type="email" />
                <Field label="AE Phone" value={formData.aeContactPhone} onChange={(v) => set("aeContactPhone", v)} />
              </Grid2>
            )}

            <Grid2>
              <Field label="Escalation Contact Name (stuck deals)" value={formData.escalationContactName} onChange={(v) => set("escalationContactName", v)} />
              <Field label="Escalation Contact Email" value={formData.escalationContactEmail} onChange={(v) => set("escalationContactEmail", v)} type="email" />
            </Grid2>

            <Grid2>
              <Select
                label="Third Party Processing Allowed"
                value={formData.thirdPartyProcessingAllowed}
                onChange={(v) => set("thirdPartyProcessingAllowed", v)}
                options={[
                  { value: "yes",          label: "Yes — any licensed processor" },
                  { value: "approved_list",label: "Yes — approved processors only" },
                  { value: "case_by_case", label: "Case by Case" },
                  { value: "no",           label: "No — not permitted" },
                ]}
              />
              {formData.thirdPartyProcessingAllowed && formData.thirdPartyProcessingAllowed !== "no" && (
                <Field label="Processing Fee Cap (if any)" value={formData.processingFeeCap} onChange={(v) => set("processingFeeCap", v)} prefix="$" placeholder="Leave blank if no cap" />
              )}
            </Grid2>
            {formData.thirdPartyProcessingAllowed && formData.thirdPartyProcessingAllowed !== "no" && (
              <Textarea label="Third Party Processing Details" value={formData.thirdPartyProcessingDetails} onChange={(v) => set("thirdPartyProcessingDetails", v)} placeholder="Any processor requirements, agreement needed, etc." />
            )}

            <Grid2>
              <Field label="Submission Portal Name / URL" value={formData.submissionPortal} onChange={(v) => set("submissionPortal", v)} placeholder="e.g. YourLender Broker Portal" />
              <Field label="Max Concurrent Loans Per Broker (if any)" value={formData.overlappingLoanCap} onChange={(v) => set("overlappingLoanCap", v)} type="number" placeholder="Leave blank if no cap" />
            </Grid2>

            <Grid2>
              <RadioGroup label="Scenario Desk Available (live verbal scenarios)" value={formData.scenarioDeskAvailable} onChange={(v) => set("scenarioDeskAvailable", v)} options={["Yes","No"]} inline />
              {formData.scenarioDeskAvailable === "Yes" && (
                <Field label="Scenario Desk Hours" value={formData.scenarioDeskHours} onChange={(v) => set("scenarioDeskHours", v)} placeholder="e.g. M-F 8am-6pm PT" />
              )}
            </Grid2>

            <Grid2>
              <RadioGroup label="In-House Underwriting" value={formData.inHouseUnderwriting} onChange={(v) => set("inHouseUnderwriting", v)} options={["Yes — in-house","No — outsourced"]} />
              <Field label="Condition Turnaround SLA (days)" value={formData.conditionTurnaroundDays} onChange={(v) => set("conditionTurnaroundDays", v)} type="number" placeholder="e.g. 2" />
            </Grid2>

            {/* ✅ ADDED: Rural Appraisal Policy */}
            <Textarea
              label="Rural Appraisal Policy"
              value={formData.ruralAppraisalPolicy}
              onChange={(v) => set("ruralAppraisalPolicy", v)}
              placeholder="e.g. Accepted with 35-day turnaround, UAD-compliant appraisers required, or restrictions on rural properties"
            />

            <Textarea label="Affiliated Business Arrangements (title, escrow, settlement services)" value={formData.affiliatedBusinessArrangements} onChange={(v) => set("affiliatedBusinessArrangements", v)} placeholder="List any affiliated companies that should be disclosed to borrowers" />
          </FormSection>
        )}

        {/* ────────────────────────────────────────────────── */}
        {/* SUBMISSION REVIEW                                  */}
        {/* ────────────────────────────────────────────────── */}
        {currentStep === steps.length - 1 && (
          <FormSection title="Review & Submit" subtitle="Your profile will be reviewed before going live on the LoanBeacons platform">

            {/* Logo preview in review */}
            {formData.logoUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px", padding: "16px", background: "#141824", borderRadius: "8px", border: "1px solid #2d3548" }}>
                <img src={formData.logoUrl} alt="Lender logo" style={{ height: "48px", maxWidth: "120px", objectFit: "contain", borderRadius: "4px" }} />
                <div>
                  <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px" }}>Logo Uploaded ✓</div>
                  <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>Will appear in Lender Library</div>
                </div>
              </div>
            )}

            <div style={styles.reviewBox}>
              {[
                ["Lender Type",          LENDER_TYPES.find((t) => t.id === formData.lenderType)?.label],
                ["Company",              formData.lenderName || "—"],
                ["Contact",              `${formData.contactName} · ${formData.contactEmail}`],
                ["Licensed States",      formData.statesLicensed.length ? `${formData.statesLicensed.length} states` : "Not specified"],
                ["Active States",        formData.statesActive.length ? formData.statesActive.join(", ") : "Not specified"],
                ["Accepting New Brokers",formData.acceptingNewBrokers || "—"],
              ].map(([label, value]) => (
                <div key={label} style={styles.reviewItem}>
                  <span style={styles.reviewLabel}>{label}</span>
                  <span style={styles.reviewValue}>{value}</span>
                </div>
              ))}
            </div>

            <div style={styles.disclaimer}>
              By submitting, you confirm that the information provided is accurate and authorized for use on the
              LoanBeacons platform. Profiles are reviewed before publication. You will be contacted if
              clarification is needed. All compensation information is displayed in compliance with applicable regulations.
            </div>

            {error && (
              <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "12px", textAlign: "center" }}>{error}</div>
            )}
          </FormSection>
        )}

      </div>{/* end body */}

      {/* ── NAVIGATION ── */}
      {currentStep > 0 && (
        <div style={styles.nav}>
          <button onClick={() => setCurrentStep((p) => p - 1)} style={styles.btnSecondary}>← Back</button>
          <span style={{ color: "#475569", fontSize: "12px" }}>Step {currentStep} of {totalSteps - 1}</span>
          {currentStep < steps.length - 1 ? (
            <button onClick={() => setCurrentStep((p) => p + 1)} style={styles.btnPrimary}>Continue →</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} style={{ ...styles.btnPrimary, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Submitting..." : "Submit Profile ✓"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── DRAG & DROP LOGO UPLOAD COMPONENT ─────────────────────

const DragDropLogo = ({ preview, uploading, progress, error, onFile, onRemove }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleClick = () => inputRef.current?.click();
  const handleChange = (e) => { const file = e.target.files?.[0]; if (file) onFile(file); };

  // STATE: has logo
  if (preview) {
    return (
      <div style={ddStyles.previewBox}>
        <div style={ddStyles.previewInner}>
          <img src={preview} alt="Logo preview" style={ddStyles.previewImg} />
          <div style={{ flex: 1 }}>
            {uploading ? (
              <>
                <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "8px" }}>Uploading... {progress}%</div>
                <div style={ddStyles.progressTrack}>
                  <div style={{ ...ddStyles.progressFill, width: `${progress}%` }} />
                </div>
              </>
            ) : (
              <div style={{ color: "#4ade80", fontSize: "12px", fontWeight: "600" }}>✓ Logo uploaded successfully</div>
            )}
          </div>
          {!uploading && (
            <button onClick={onRemove} style={ddStyles.removeBtn} title="Remove logo">✕</button>
          )}
        </div>
      </div>
    );
  }

  // STATE: empty drop zone
  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        style={{
          ...ddStyles.dropZone,
          borderColor: isDragging ? "#e8531a" : "#2d3548",
          background: isDragging ? "#e8531a0a" : "#141824",
        }}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/svg+xml,image/webp" onChange={handleChange} style={{ display: "none" }} />
        <div style={{ fontSize: "32px", marginBottom: "10px" }}>🏢</div>
        <div style={{ color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
          {isDragging ? "Drop your logo here" : "Drag & drop your logo here"}
        </div>
        <div style={{ color: "#475569", fontSize: "11px", marginBottom: "14px" }}>or click to browse files</div>
        <div style={ddStyles.browseBtn}>Browse Files</div>
        <div style={{ color: "#334155", fontSize: "10px", marginTop: "10px" }}>JPG · PNG · SVG · WebP · Max 5MB</div>
      </div>
      {error && <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "6px" }}>{error}</div>}
    </div>
  );
};

// ── PDF DRAG-DROP COMPONENT (guidelines + matrix uploads, PRD v3.1 §3) ──
const DragDropPDF = ({ title, subtitle, icon, filename, uploading, progress, extracting, extracted, error, onFile, onRemove }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleClick = () => inputRef.current?.click();
  const handleChange = (e) => { const file = e.target.files?.[0]; if (file) onFile(file); };

  const extractionOk = extracted && !extracted.error;
  const extractionFailed = extracted && extracted.error;

  // STATE: has file
  if (filename) {
    return (
      <div style={ddStyles.previewBox}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "24px" }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#cbd5e1", fontSize: "12px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {filename}
              </div>
              <div style={{ color: "#64748b", fontSize: "10px", marginTop: "2px" }}>{title}</div>
            </div>
            {!uploading && !extracting && (
              <button onClick={onRemove} style={ddStyles.removeBtn} title="Remove file">✕</button>
            )}
          </div>
          {uploading && (
            <div>
              <div style={{ color: "#94a3b8", fontSize: "11px", marginBottom: "4px" }}>Uploading... {progress}%</div>
              <div style={ddStyles.progressTrack}>
                <div style={{ ...ddStyles.progressFill, width: `${progress}%` }} />
              </div>
            </div>
          )}
          {!uploading && extracting && (
            <div style={{ color: "#fbbf24", fontSize: "11px", fontWeight: "600" }}>
              🤖 Claude AI is extracting structured data...
            </div>
          )}
          {!uploading && !extracting && extractionOk && (
            <div style={{ color: "#4ade80", fontSize: "11px", fontWeight: "600" }}>
              ✓ Uploaded + extracted for admin review
            </div>
          )}
          {!uploading && !extracting && extractionFailed && (
            <div style={{ color: "#fbbf24", fontSize: "11px", fontWeight: "600" }}>
              ⚠ Uploaded. Extraction skipped — admin will review manually.
            </div>
          )}
          {!uploading && !extracting && !extracted && (
            <div style={{ color: "#4ade80", fontSize: "11px", fontWeight: "600" }}>
              ✓ Uploaded successfully
            </div>
          )}
        </div>
      </div>
    );
  }

  // STATE: empty drop zone
  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        style={{
          ...ddStyles.dropZone,
          padding: "24px 16px",
          borderColor: isDragging ? "#e8531a" : "#2d3548",
          background: isDragging ? "#e8531a0a" : "#141824",
        }}
      >
        <input ref={inputRef} type="file" accept="application/pdf" onChange={handleChange} style={{ display: "none" }} />
        <div style={{ fontSize: "28px", marginBottom: "8px" }}>{icon}</div>
        <div style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: "700", marginBottom: "3px" }}>
          {title}
        </div>
        <div style={{ color: "#64748b", fontSize: "10px", marginBottom: "12px" }}>{subtitle}</div>
        <div style={ddStyles.browseBtn}>Upload PDF</div>
        <div style={{ color: "#334155", fontSize: "9px", marginTop: "8px" }}>PDF only · Max 25MB · AI parses on upload</div>
      </div>
      {error && <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "6px" }}>{error}</div>}
    </div>
  );
};

const ddStyles = {
  dropZone: {
    border: "2px dashed",
    borderRadius: "10px",
    padding: "32px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  browseBtn: {
    display: "inline-block",
    background: "#e8531a",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "700",
    padding: "8px 20px",
    borderRadius: "6px",
  },
  previewBox: {
    border: "1px solid #2d3548",
    borderRadius: "10px",
    padding: "16px",
    background: "#141824",
  },
  previewInner: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  previewImg: {
    height: "56px",
    maxWidth: "140px",
    objectFit: "contain",
    borderRadius: "6px",
    background: "#fff",
    padding: "4px",
  },
  progressTrack: {
    height: "4px",
    background: "#1e2535",
    borderRadius: "2px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#e8531a",
    transition: "width 0.3s",
  },
  removeBtn: {
    background: "none",
    border: "1px solid #2d3548",
    color: "#64748b",
    borderRadius: "4px",
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: "12px",
    flexShrink: 0,
  },
};

// ── SUCCESS SCREEN ─────────────────────────────────────────

const SuccessScreen = ({ lenderName, logoUrl }) => (
  <div style={{ ...styles.container, textAlign: "center", paddingTop: "80px" }}>
    {logoUrl && (
      <img src={logoUrl} alt="Logo" style={{ height: "64px", maxWidth: "180px", objectFit: "contain", margin: "0 auto 20px", display: "block", background: "#fff", padding: "8px", borderRadius: "8px" }} />
    )}
    <div style={{ fontSize: "48px", marginBottom: "24px" }}>✅</div>
    <h2 style={{ color: "#f1f5f9", fontSize: "24px", fontWeight: "700", marginBottom: "12px" }}>
      Profile Submitted Successfully
    </h2>
    <p style={{ color: "#94a3b8", fontSize: "15px", maxWidth: "480px", margin: "0 auto 24px" }}>
      Thank you, {lenderName || ""}. Your lender profile is under review and will be published to the
      LoanBeacons platform once verified. You'll receive a confirmation email within 1–2 business days.
    </p>
    <p style={{ color: "#64748b", fontSize: "13px" }}>
      Questions? Contact{" "}
      <a href="mailto:lenders@loanbeacons.com" style={{ color: "#e8531a" }}>lenders@loanbeacons.com</a>
    </p>
  </div>
);

// ── FORM FIELD COMPONENTS ──────────────────────────────────

const Field = ({ label, value, onChange, type = "text", placeholder, prefix, suffix }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <div style={{ display: "flex", alignItems: "center" }}>
      {prefix && <span style={styles.inputAddon}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...styles.input,
          borderRadius: prefix && suffix ? "0" : prefix ? "0 6px 6px 0" : suffix ? "6px 0 0 6px" : "6px",
        }}
      />
      {suffix && <span style={{ ...styles.inputAddon, borderRadius: "0 6px 6px 0" }}>{suffix}</span>}
    </div>
  </div>
);

const Textarea = ({ label, value, onChange, placeholder }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...styles.input, resize: "vertical", lineHeight: "1.5" }} />
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.input}>
      <option value="">Select...</option>
      {options.map((opt) =>
        typeof opt === "string"
          ? <option key={opt} value={opt}>{opt}</option>
          : <option key={opt.value} value={opt.value}>{opt.label}</option>
      )}
    </select>
  </div>
);

const RadioGroup = ({ label, value, onChange, options, inline }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "6px" }}>
      {options.map((opt) => (
        <label key={opt} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: value === opt ? "#e8531a" : "#94a3b8", fontSize: "13px", fontWeight: value === opt ? "600" : "400" }}>
          <div onClick={() => onChange(opt)} style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${value === opt ? "#e8531a" : "#2d3548"}`, background: value === opt ? "#e8531a" : "transparent", cursor: "pointer", flexShrink: 0 }} />
          {opt}
        </label>
      ))}
    </div>
  </div>
);

const CheckboxRow = ({ items, selected, onToggle }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px", marginTop: "6px" }}>
    {items.map((item) => {
      const isSelected = selected.includes(item);
      return (
        <div key={item} onClick={() => onToggle(item)} style={{ padding: "6px 14px", borderRadius: "20px", border: `1px solid ${isSelected ? "#e8531a" : "#2d3548"}`, background: isSelected ? "#e8531a18" : "#1a1f2e", color: isSelected ? "#e8531a" : "#64748b", fontSize: "12px", fontWeight: isSelected ? "600" : "400", cursor: "pointer" }}>
          {item}
        </div>
      );
    })}
  </div>
);

const StateSelector = ({ label, selected, onToggle, note }) => (
  <div style={{ marginBottom: "20px" }}>
    <Label>{label}</Label>
    {note && <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "8px" }}>{note}</div>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {US_STATES.map((state) => {
        const isSelected = selected.includes(state);
        return (
          <div key={state} onClick={() => onToggle(state)} style={{ width: "38px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: `1px solid ${isSelected ? "#e8531a" : "#1e2535"}`, background: isSelected ? "#e8531a" : "#1a1f2e", color: isSelected ? "#fff" : "#475569", fontSize: "10px", fontWeight: "600", cursor: "pointer" }}>
            {state}
          </div>
        );
      })}
    </div>
    <div style={{ color: "#475569", fontSize: "11px", marginTop: "6px" }}>{selected.length} state{selected.length !== 1 ? "s" : ""} selected</div>
  </div>
);

const NicheGrid = ({ niches, selected, details, onToggle, onDetail }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
    {niches.map(({ key, label, placeholder }) => {
      const isSelected = selected[key];
      const detailValue = typeof details === "object" ? (details[key] ?? "") : "";
      return (
        <div key={key} style={{ background: isSelected ? "#1a2035" : "#141824", border: `1px solid ${isSelected ? "#e8531a44" : "#1e2535"}`, borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", cursor: "pointer" }} onClick={() => onToggle(key)}>
            <div style={{ width: "20px", height: "20px", borderRadius: "4px", border: `2px solid ${isSelected ? "#e8531a" : "#2d3548"}`, background: isSelected ? "#e8531a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {isSelected && <span style={{ color: "#fff", fontSize: "12px", lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ color: isSelected ? "#f1f5f9" : "#64748b", fontWeight: isSelected ? "600" : "400", fontSize: "14px" }}>{label}</span>
          </div>
          {isSelected && (
            <div style={{ padding: "0 16px 12px" }}>
              <textarea value={detailValue} onChange={(e) => onDetail(key, e.target.value)} placeholder={placeholder || `Describe your specific ${label.toLowerCase()} parameters...`} rows={2} style={{ ...styles.input, resize: "vertical", fontSize: "12px" }} />
            </div>
          )}
        </div>
      );
    })}
  </div>
);

const FormSection = ({ title, subtitle, children }) => (
  <div>
    <div style={{ marginBottom: "24px" }}>
      <h3 style={{ color: "#f1f5f9", fontSize: "20px", fontWeight: "700", margin: "0 0 4px" }}>{title}</h3>
      {subtitle && <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>{subtitle}</p>}
    </div>
    {children}
  </div>
);

const Label = ({ children }) => (
  <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{children}</div>
);

const SectionSubhead = ({ children }) => (
  <div style={{ color: "#e8531a", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", margin: "20px 0 12px" }}>{children}</div>
);

const Grid2 = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>{children}</div>
);

const Grid4 = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "8px" }}>{children}</div>
);

// ── HELPERS ────────────────────────────────────────────────

function lenderEntityOptions(type) {
  if (type === "conventional") return ["Retail Bank","Wholesale Lender","Correspondent Lender","Credit Union","Mortgage Banker"];
  if (type === "nonqm")        return ["Direct Lender","Private Fund","Mortgage REIT","Correspondent","Wholesale"];
  if (type === "hard_money")   return ["Direct Lender","Private Fund","Family Office","Mortgage Fund","Private Investor"];
  return [];
}

// ── STYLES ─────────────────────────────────────────────────

const styles = {
  container: { minHeight: "100vh", background: "#0d1117", fontFamily: "'Inter', -apple-system, sans-serif", color: "#f1f5f9" },
  header: { background: "linear-gradient(135deg, #141824 0%, #1a1f2e 100%)", borderBottom: "1px solid #2d3548", padding: "32px 48px", textAlign: "center" },
  logo: { color: "#e8531a", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" },
  headerTitle: { color: "#f1f5f9", fontSize: "28px", fontWeight: "800", marginBottom: "8px" },
  headerSub: { color: "#64748b", fontSize: "13px", maxWidth: "560px", margin: "0 auto" },
  progressWrapper: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", background: "#0d1117", borderBottom: "1px solid #1e2535", gap: "16px" },
  progressTrack: { flex: 1, height: "6px", background: "#1e2535", borderRadius: "3px", overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #e8531a, #f97316)", borderRadius: "3px", transition: "width 0.4s ease" },
  progressPct: { color: "#e8531a", fontSize: "12px", fontWeight: "700", minWidth: "36px", textAlign: "right" },
  progressLabel: { color: "#475569", fontSize: "12px", whiteSpace: "nowrap" },
  body: { maxWidth: "800px", margin: "0 auto", padding: "40px 24px" },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" },
  typeCard: { padding: "32px 20px", borderRadius: "12px", border: "2px solid", cursor: "pointer", textAlign: "center", transition: "all 0.2s" },
  input: { width: "100%", background: "#1a1f2e", border: "1px solid #2d3548", borderRadius: "6px", color: "#f1f5f9", padding: "10px 12px", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  inputAddon: { background: "#141824", border: "1px solid #2d3548", borderRight: "none", color: "#64748b", padding: "10px 10px", fontSize: "12px", borderRadius: "6px 0 0 6px", whiteSpace: "nowrap" },
  reviewBox: { background: "#141824", border: "1px solid #2d3548", borderRadius: "8px", padding: "20px", marginBottom: "24px" },
  reviewItem: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e2535" },
  reviewLabel: { color: "#64748b", fontSize: "12px" },
  reviewValue: { color: "#f1f5f9", fontSize: "13px", fontWeight: "600" },
  disclaimer: { color: "#475569", fontSize: "11px", lineHeight: "1.6", padding: "12px 16px", background: "#141824", borderRadius: "6px", border: "1px solid #1e2535" },
  nav: { position: "sticky", bottom: 0, background: "#0d1117", borderTop: "1px solid #1e2535", padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  btnPrimary: { background: "#e8531a", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 28px", fontSize: "14px", fontWeight: "700", cursor: "pointer" },
  btnSecondary: { background: "transparent", color: "#94a3b8", border: "1px solid #2d3548", borderRadius: "8px", padding: "12px 24px", fontSize: "14px", cursor: "pointer" },
};

export default LenderIntakeForm;