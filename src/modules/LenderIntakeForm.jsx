// ============================================================
// LenderIntakeForm.jsx
// Module 6B — Lender Self-Reported Profile Form
//
// Three lender categories: Conventional/Agency, Non-QM, Hard Money
// Writes completed profiles to Firestore
// Designed to be shared as a standalone link with lenders
//
// Route: /lender-intake (or /lender-intake/:token for pre-filled)
// Firestore collection: lenderIntakeSubmissions
// ============================================================

import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

// ── FORM STEP DEFINITIONS ──────────────────────────────────

const LENDER_TYPES = [
  { id: "conventional", label: "Conventional / Agency", icon: "🏦" },
  { id: "nonqm", label: "Non-QM / Alternative", icon: "📊" },
  { id: "hard_money", label: "Hard Money / Private / Bridge", icon: "🔥" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
];

// ── INITIAL FORM STATE ─────────────────────────────────────

const initialState = {
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
  // Niches (checkboxes)
  conv_niches: {
    firstTimeHomebuyer: false,
    communityLending: false,
    doctorProfessional: false,
    constructionToPerm: false,
    renovation: false,
    highBalance: false,
    jumbo: false,
    bondDPA: false,
    manufactured: false,
    rural: false,
  },
  conv_nicheDetails: {},
  // Comp
  conv_srpRanges: "",
  conv_llpasApplied: "",
  conv_maxBrokerComp: "",
  conv_pricingExceptionProcess: "",
  conv_lockPeriods: "",
  conv_floatDownPolicy: "",
  conv_renegotiationPolicy: "",

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
    bankStatement: false,
    plOnly: false,
    assetDepletion: false,
    dscr: false,
    tenNinetyNine: false,
    foreignNational: false,
    recentCreditEvents: false,
    interestOnly: false,
  },
  nqm_bankStatementDetails: "",
  nqm_plDetails: "",
  nqm_assetDepletionDetails: "",
  nqm_dscrDetails: "",
  nqm_foreignNationalDetails: "",
  nqm_recentCreditEventDetails: "",
  // Niches
  nqm_niches: {
    strAirbnbDSCR: false,
    mixedUseDSCR: false,
    multifamilyDSCR: false,
    highNetWorth: false,
    cryptoAssets: false,
    nearMissConventional: false,
    fixAndHold: false,
    firstTimeInvestor: false,
    condoNonWarrantable: false,
    commercialCrossover: false,
  },
  nqm_nicheDetails: {},
  // Comp
  nqm_parPricing: "",
  nqm_yspTiers: "",
  nqm_maxBrokerComp: "",
  nqm_creditEventPricingAdjustment: "",
  nqm_lockPolicies: "",
  nqm_renegotiationPolicy: "",

  // ── HARD MONEY FIELDS ──
  hm_maxLTVonARV: "",
  hm_maxLTVonPurchase: "",
  hm_minLoanAmount: "",
  hm_maxLoanAmount: "",
  hm_termsAvailable: [],
  hm_fastCloseCapable: "",
  hm_borrowerExperienceRequired: "",
  hm_entityRequired: "",
  hm_personalGuaranteeRequired: "",
  hm_crossCollateralization: "",
  hm_proofOfFundsLetter: "",
  hm_sameDayTermSheet: "",
  hm_rehabBudgetCapacity: "",
  hm_drawSchedule: "",
  hm_numberOfDraws: "",
  hm_drawTurnaroundDays: "",
  hm_buildersRisk: "",
  hm_vacantProperty: "",
  hm_liabilityMinimum: "",
  hm_propertyTypes: [],
  hm_extensionFee: "",
  hm_lenderPoints: "",
  hm_processingFee: "",
  hm_adminFee: "",
  hm_maxBrokerPoints: "",
  hm_brokerFeeStructure: [],
  hm_yspAvailable: "",
  hm_yspDetails: "",
  hm_totalFeeCap: "",
  hm_prepaymentPenalty: "",
  // Niches
  hm_niches: {
    fixAndFlip: false,
    groundUpConstruction: false,
    bridgeToPermanent: false,
    foreignNational: false,
    nonWarrantableCondo: false,
    landLoans: false,
    commercialMixedUse: false,
    fastCloseUnder10Days: false,
    portfolioRepeatBorrower: false,
    highLeverageRehab: false,
  },
  hm_nicheDetails: {},
  hm_preferredExitStrategies: [],
  hm_marketsActivelySought: "",
  hm_dealTypesToAvoid: "",
};

// ── MAIN COMPONENT ─────────────────────────────────────────

const LenderIntakeForm = ({ prefillToken }) => {
  const [formData, setFormData] = useState(initialState);
  const [currentStep, setCurrentStep] = useState(0); // 0 = type selection
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Steps per lender type
  const getSteps = (type) => {
    const universal = ["basic_info", "operations", "lock_uw", "submission"];
    if (type === "conventional") return ["type", "basic_info", "core_qual", "overlays", "niches_conv", "comp_conv", "operations", "submission"];
    if (type === "nonqm") return ["type", "basic_info", "core_qual_nqm", "products", "niches_nqm", "comp_nqm", "operations", "submission"];
    if (type === "hard_money") return ["type", "basic_info", "core_qual_hm", "rehab", "niches_hm", "comp_hm", "deal_prefs", "operations", "submission"];
    return ["type"];
  };

  const steps = getSteps(formData.lenderType);
  const totalSteps = steps.length;

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));
  const toggle = (section, key) =>
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: !prev[section][key] },
    }));

  const handleStateToggle = (field, state) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(state)
        ? prev[field].filter((s) => s !== state)
        : [...prev[field], state],
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, "lenderIntakeSubmissions"), {
        ...formData,
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

  if (submitted) return <SuccessScreen lenderName={formData.lenderName} />;

  return (
    <div style={styles.container}>
      {/* ── HEADER ── */}
      <div style={styles.header}>
        <div style={styles.logo}>LoanBeacons</div>
        <div style={styles.headerTitle}>Lender Profile Intake</div>
        <div style={styles.headerSub}>
          Your information will be used to match you with the right loan scenarios on the LoanBeacons platform.
          All fields are self-reported and can be updated at any time.
        </div>
      </div>

      {/* ── PROGRESS ── */}
      {formData.lenderType && (
        <div style={styles.progressBar}>
          {steps.map((step, i) => (
            <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  ...styles.progressDot,
                  background: i < currentStep ? "#e8531a" : i === currentStep ? "#e8531a" : "#2d3548",
                  border: `2px solid ${i <= currentStep ? "#e8531a" : "#2d3548"}`,
                }}
              />
              {i < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    background: i < currentStep ? "#e8531a" : "#2d3548",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── FORM BODY ── */}
      <div style={styles.body}>
        {/* STEP 0: TYPE SELECTION */}
        {currentStep === 0 && (
          <FormSection title="What type of lender are you?" subtitle="Select the category that best describes your lending operation">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              {LENDER_TYPES.map((type) => (
                <div
                  key={type.id}
                  onClick={() => {
                    set("lenderType", type.id);
                    setCurrentStep(1);
                  }}
                  style={{
                    ...styles.typeCard,
                    borderColor: formData.lenderType === type.id ? "#e8531a" : "#2d3548",
                    background: formData.lenderType === type.id ? "#e8531a14" : "#1a1f2e",
                  }}
                >
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>{type.icon}</div>
                  <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "15px" }}>{type.label}</div>
                </div>
              ))}
            </div>
          </FormSection>
        )}

        {/* STEP: BASIC INFO (all types) */}
        {currentStep === 1 && (
          <FormSection title="Basic Information" subtitle="Tell us about your organization and primary contact">
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
          </FormSection>
        )}

        {/* STEP: CONVENTIONAL CORE QUAL */}
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

            <Grid2>
              <Field label="Conforming Loan Limit" value={formData.conv_conformingLimit} onChange={(v) => set("conv_conformingLimit", v)} prefix="$" placeholder="806,500" />
              <Field label="Jumbo Threshold" value={formData.conv_jumboThreshold} onChange={(v) => set("conv_jumboThreshold", v)} prefix="$" />
              <Field label="Min Reserves (months)" value={formData.conv_minReserves} onChange={(v) => set("conv_minReserves", v)} type="number" placeholder="2" />
              <RadioGroup label="HMDA Reporting" value={formData.conv_hmda} onChange={(v) => set("conv_hmda", v)} options={["Yes", "No"]} inline />
            </Grid2>
          </FormSection>
        )}

        {/* STEP: CONVENTIONAL OVERLAYS */}
        {formData.lenderType === "conventional" && currentStep === 3 && (
          <FormSection title="Overlays & Restrictions" subtitle="Where your guidelines are stricter than agency guidelines">
            <Grid2>
              <Field label="Bankruptcy Seasoning (months)" value={formData.conv_bkSeasoning} onChange={(v) => set("conv_bkSeasoning", v)} type="number" placeholder="Agency standard if blank" />
              <Field label="Foreclosure Seasoning (months)" value={formData.conv_foreclosureSeasoning} onChange={(v) => set("conv_foreclosureSeasoning", v)} type="number" />
            </Grid2>
            <Textarea label="Self-Employed Income Requirements (if stricter than agency)" value={formData.conv_selfEmployedRequirements} onChange={(v) => set("conv_selfEmployedRequirements", v)} />
            <Textarea label="Non-Warrantable Condo Policy" value={formData.conv_nonWarrantableCondoPolicy} onChange={(v) => set("conv_nonWarrantableCondoPolicy", v)} />
            <Grid2>
              <RadioGroup label="Manufactured Home" value={formData.conv_manufacturedHome} onChange={(v) => set("conv_manufacturedHome", v)} options={["Accepted", "Not Accepted", "Case by Case"]} />
              <RadioGroup label="2–4 Unit Properties" value={formData.conv_twoToFourUnit} onChange={(v) => set("conv_twoToFourUnit", v)} options={["Accepted", "Not Accepted", "Overlays Apply"]} />
            </Grid2>
            <Textarea label="Gift Fund Restrictions (if any)" value={formData.conv_giftFundRestrictions} onChange={(v) => set("conv_giftFundRestrictions", v)} placeholder="Leave blank if no restrictions beyond agency guidelines" />
            <RadioGroup label="Down Payment Assistance Programs Accepted" value={formData.conv_dpaAcceptance} onChange={(v) => set("conv_dpaAcceptance", v)} options={["Yes — All DPA", "Yes — Approved List Only", "No"]} />
          </FormSection>
        )}

        {/* STEP: CONVENTIONAL NICHES */}
        {formData.lenderType === "conventional" && currentStep === 4 && (
          <FormSection title="Product Niches" subtitle="Check all that apply — then describe your specific parameters for each">
            <NicheGrid
              niches={[
                { key: "firstTimeHomebuyer", label: "First-Time Homebuyer Programs", detailKey: "firstTimeHomebuyerDetails" },
                { key: "communityLending", label: "Community Lending / CRA Products", detailKey: "communityLendingDetails" },
                { key: "doctorProfessional", label: "Doctor / Professional Loans", detailKey: "doctorProfessionalDetails" },
                { key: "constructionToPerm", label: "Construction-to-Perm", detailKey: "constructionToPermDetails" },
                { key: "renovation", label: "Renovation (203k, HomeStyle, CHOICERenovation)", detailKey: "renovationDetails" },
                { key: "highBalance", label: "High-Balance Specialty", detailKey: "highBalanceDetails" },
                { key: "jumbo", label: "Jumbo (describe where guidelines diverge)", detailKey: "jumboDetails" },
                { key: "bondDPA", label: "Bond / DPA Program Acceptance", detailKey: "bondDPADetails" },
                { key: "manufactured", label: "Manufactured / Modular", detailKey: "manufacturedDetails" },
                { key: "rural", label: "Rural Properties", detailKey: "ruralDetails" },
              ]}
              selected={formData.conv_niches}
              details={formData.conv_nicheDetails}
              onToggle={(key) => toggle("conv_niches", key)}
              onDetail={(key, value) =>
                setFormData((prev) => ({
                  ...prev,
                  conv_nicheDetails: { ...prev.conv_nicheDetails, [key]: value },
                }))
              }
            />
          </FormSection>
        )}

        {/* STEP: CONVENTIONAL COMP */}
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
          </FormSection>
        )}

        {/* STEP: NON-QM CORE QUAL */}
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

        {/* STEP: NON-QM PRODUCTS */}
        {formData.lenderType === "nonqm" && currentStep === 3 && (
          <FormSection title="Product Availability" subtitle="Check all products you offer, then provide specific parameters for each">
            <NicheGrid
              niches={[
                { key: "bankStatement", label: "Bank Statement", detailKey: "bankStatementDetails", placeholder: "e.g. 12mo/24mo, personal/business, expense factor used, max LTV" },
                { key: "plOnly", label: "P&L Only", detailKey: "plDetails", placeholder: "e.g. CPA required, time period, max LTV" },
                { key: "assetDepletion", label: "Asset Depletion / Asset Utilization", detailKey: "assetDepletionDetails", placeholder: "e.g. formula used, eligible asset types" },
                { key: "dscr", label: "DSCR", detailKey: "dscrDetails", placeholder: "e.g. min DSCR ratio, no-ratio option, STR income acceptance" },
                { key: "tenNinetyNine", label: "1099 Only", detailKey: "tenNinetyNineDetails", placeholder: "e.g. 12mo or 24mo, industries accepted" },
                { key: "foreignNational", label: "Foreign National", detailKey: "foreignNationalDetails", placeholder: "e.g. ITIN accepted, visa types, credit alternative requirements" },
                { key: "recentCreditEvents", label: "Recent Credit Events (BK, FC, SS)", detailKey: "recentCreditEventDetails", placeholder: "e.g. BK accepted at 12mo, what LTV/rate adjustment applies" },
                { key: "interestOnly", label: "Interest Only", detailKey: "interestOnlyDetails", placeholder: "e.g. available on which products, IO period length" },
              ]}
              selected={formData.nqm_products}
              details={formData}
              onToggle={(key) => toggle("nqm_products", key)}
              onDetail={(key, value) => set(`nqm_${key}Details`, value)}
              detailFieldOverride
            />
          </FormSection>
        )}

        {/* STEP: NON-QM NICHES */}
        {formData.lenderType === "nonqm" && currentStep === 4 && (
          <FormSection title="Product Niches" subtitle="Specialized programs that differentiate your Non-QM offering">
            <NicheGrid
              niches={[
                { key: "strAirbnbDSCR", label: "Short-Term Rental / Airbnb DSCR", detailKey: "strDetails" },
                { key: "mixedUseDSCR", label: "Mixed-Use DSCR", detailKey: "mixedUseDetails" },
                { key: "multifamilyDSCR", label: "Multi-Family DSCR (5–10 units)", detailKey: "multifamilyDetails" },
                { key: "highNetWorth", label: "High-Net-Worth / Asset-Based", detailKey: "highNetWorthDetails" },
                { key: "cryptoAssets", label: "Crypto Asset Acceptance", detailKey: "cryptoDetails" },
                { key: "nearMissConventional", label: "Near-Miss Conventional", detailKey: "nearMissDetails" },
                { key: "fixAndHold", label: "Fix-and-Hold Investor", detailKey: "fixAndHoldDetails" },
                { key: "firstTimeInvestor", label: "First-Time Investor Programs", detailKey: "firstTimeInvestorDetails" },
                { key: "condoNonWarrantable", label: "Condo / Non-Warrantable Condo", detailKey: "condoDetails" },
                { key: "commercialCrossover", label: "Commercial Property Crossover", detailKey: "commercialDetails" },
              ]}
              selected={formData.nqm_niches}
              details={formData.nqm_nicheDetails}
              onToggle={(key) => toggle("nqm_niches", key)}
              onDetail={(key, value) =>
                setFormData((prev) => ({
                  ...prev,
                  nqm_nicheDetails: { ...prev.nqm_nicheDetails, [key]: value },
                }))
              }
            />
          </FormSection>
        )}

        {/* STEP: NON-QM COMP */}
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

        {/* STEP: HARD MONEY CORE QUAL */}
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
              items={["6 months", "12 months", "18 months", "24 months", "36 months"]}
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
              <RadioGroup label="Fast Close Capable (under 10 days)" value={formData.hm_fastCloseCapable} onChange={(v) => set("hm_fastCloseCapable", v)} options={["Yes", "No"]} inline />
              <RadioGroup label="Same-Day Term Sheet Available" value={formData.hm_sameDayTermSheet} onChange={(v) => set("hm_sameDayTermSheet", v)} options={["Yes", "No"]} inline />
              <RadioGroup label="Proof of Funds Letter Available" value={formData.hm_proofOfFundsLetter} onChange={(v) => set("hm_proofOfFundsLetter", v)} options={["Yes", "No"]} inline />
              <RadioGroup label="Cross-Collateralization Allowed" value={formData.hm_crossCollateralization} onChange={(v) => set("hm_crossCollateralization", v)} options={["Yes", "No"]} inline />
            </Grid2>

            <Grid2>
              <Select
                label="Borrower Experience Required"
                value={formData.hm_borrowerExperienceRequired}
                onChange={(v) => set("hm_borrowerExperienceRequired", v)}
                options={[
                  { value: "none", label: "None — first-time investors welcome" },
                  { value: "some", label: "Some — prior deal or two preferred" },
                  { value: "seasoned", label: "Seasoned — multiple completed projects required" },
                ]}
              />
              <Select
                label="Entity Requirement"
                value={formData.hm_entityRequired}
                onChange={(v) => set("hm_entityRequired", v)}
                options={[
                  { value: "LLC_required", label: "LLC required" },
                  { value: "LLC_preferred", label: "LLC preferred, personal OK" },
                  { value: "personal_ok", label: "Personal vesting acceptable" },
                ]}
              />
            </Grid2>

            <SectionSubhead>Property Types Accepted</SectionSubhead>
            <CheckboxRow
              items={["SFR", "2-4 Unit", "Multifamily 5+", "Commercial", "Mixed Use", "Condo", "Non-Warrantable Condo", "Townhome", "Industrial", "Office/Retail", "Land (entitled)"]}
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

        {/* STEP: HARD MONEY REHAB */}
        {formData.lenderType === "hard_money" && currentStep === 3 && (
          <FormSection title="Rehab & Construction Parameters" subtitle="Your capacity and structure for rehabilitation and construction deals">
            <Grid2>
              <Field label="Max Rehab Budget Capacity" value={formData.hm_rehabBudgetCapacity} onChange={(v) => set("hm_rehabBudgetCapacity", v)} prefix="$" placeholder="2,000,000" />
              <RadioGroup label="Draw Schedule Available" value={formData.hm_drawSchedule} onChange={(v) => set("hm_drawSchedule", v)} options={["Yes", "No"]} inline />
            </Grid2>
            {formData.hm_drawSchedule === "Yes" && (
              <Grid2>
                <Field label="Number of Draws" value={formData.hm_numberOfDraws} onChange={(v) => set("hm_numberOfDraws", v)} type="number" placeholder="5" />
                <Field label="Draw Turnaround (days)" value={formData.hm_drawTurnaroundDays} onChange={(v) => set("hm_drawTurnaroundDays", v)} type="number" placeholder="3" />
              </Grid2>
            )}
            <SectionSubhead>Insurance Requirements</SectionSubhead>
            <Grid2>
              <RadioGroup label="Builder's Risk Required" value={formData.hm_buildersRisk} onChange={(v) => set("hm_buildersRisk", v)} options={["Yes", "No"]} inline />
              <RadioGroup label="Vacant Property Policy Required" value={formData.hm_vacantProperty} onChange={(v) => set("hm_vacantProperty", v)} options={["Yes", "No"]} inline />
            </Grid2>
            <Field label="Minimum Liability Coverage" value={formData.hm_liabilityMinimum} onChange={(v) => set("hm_liabilityMinimum", v)} prefix="$" placeholder="1,000,000" />
            <Field label="Extension Fee" value={formData.hm_extensionFee} onChange={(v) => set("hm_extensionFee", v)} placeholder="e.g. 1% per extension" />
          </FormSection>
        )}

        {/* STEP: HARD MONEY NICHES */}
        {formData.lenderType === "hard_money" && currentStep === 4 && (
          <FormSection title="Product Niches" subtitle="Your specialties — describe specific terms or requirements for each niche you check">
            <NicheGrid
              niches={[
                { key: "fixAndFlip", label: "Fix & Flip Specialist", detailKey: "fixAndFlipDetails", placeholder: "e.g. first-time OK, max % of purchase + rehab, how you calculate max offer" },
                { key: "groundUpConstruction", label: "Ground-Up Construction", detailKey: "groundUpDetails", placeholder: "e.g. experience required, shovel-ready only, lot requirements" },
                { key: "bridgeToPermanent", label: "Bridge-to-Permanent", detailKey: "bridgeToPermDetails", placeholder: "e.g. exit options, partner lenders, seasoning on bridge-to-DSCR" },
                { key: "foreignNational", label: "Foreign National Programs", detailKey: "foreignNationalDetails", placeholder: "e.g. ITIN, passport, foreign bank statements, visa types" },
                { key: "nonWarrantableCondo", label: "Non-Warrantable Condo", detailKey: "nonWarrantableDetails", placeholder: "Describe how you handle non-warrantable condo eligibility" },
                { key: "landLoans", label: "Land Loans", detailKey: "landLoanDetails", placeholder: "e.g. entitled land only, lot size limits, states" },
                { key: "commercialMixedUse", label: "Commercial / Mixed-Use", detailKey: "commercialDetails", placeholder: "e.g. max units, commercial use %, states" },
                { key: "fastCloseUnder10Days", label: "Fast Close (Under 10 Days)", detailKey: "fastCloseDetails", placeholder: "What enables the fast close? Requirements?" },
                { key: "portfolioRepeatBorrower", label: "Portfolio / Repeat Borrower Program", detailKey: "repeatBorrowerDetails", placeholder: "e.g. pricing benefits, streamlined docs, dedicated contact" },
                { key: "highLeverageRehab", label: "High-Leverage Rehab (90%+ purchase + 100% rehab)", detailKey: "highLeverageDetails", placeholder: "e.g. max ARV LTV, borrower requirements, deal size limits" },
              ]}
              selected={formData.hm_niches}
              details={formData.hm_nicheDetails}
              onToggle={(key) => toggle("hm_niches", key)}
              onDetail={(key, value) =>
                setFormData((prev) => ({
                  ...prev,
                  hm_nicheDetails: { ...prev.hm_nicheDetails, [key]: value },
                }))
              }
            />
          </FormSection>
        )}

        {/* STEP: HARD MONEY COMP */}
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
              items={["Points", "Flat Fee", "Both"]}
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
              <RadioGroup label="YSP / Backend Broker Premium Available" value={formData.hm_yspAvailable} onChange={(v) => set("hm_yspAvailable", v)} options={["Yes", "No"]} inline />
            </Grid2>
            {formData.hm_yspAvailable === "Yes" && (
              <Textarea label="YSP Structure Details" value={formData.hm_yspDetails} onChange={(v) => set("hm_yspDetails", v)} placeholder="e.g. 0.5% YSP at +1% above par rate, 1% at +2%" />
            )}
            <Field label="Prepayment Penalty" value={formData.hm_prepaymentPenalty} onChange={(v) => set("hm_prepaymentPenalty", v)} placeholder="None, or describe structure" />
          </FormSection>
        )}

        {/* STEP: HARD MONEY DEAL PREFS */}
        {formData.lenderType === "hard_money" && currentStep === 6 && (
          <FormSection title="Deal Preferences" subtitle="Help loan officers understand what kinds of deals you want">
            <SectionSubhead>Preferred Exit Strategies (check all you accept)</SectionSubhead>
            <CheckboxRow
              items={["Refinance to permanent", "Sale of property", "Construction-to-permanent loan"]}
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

        {/* STEP: OPERATIONS (all types — last before submission) */}
        {currentStep === steps.length - 2 && (
          <FormSection title="Operations & Submission Details" subtitle="How loan officers should work with you">
            <Grid2>
              <RadioGroup label="Dedicated AE Assigned to Brokers" value={formData.dedicatedAEAssigned} onChange={(v) => set("dedicatedAEAssigned", v)} options={["Yes", "No"]} inline />
              {formData.dedicatedAEAssigned === "Yes" && (
                <>
                  <Field label="AE Name" value={formData.aeContactName} onChange={(v) => set("aeContactName", v)} />
                  <Field label="AE Email" value={formData.aeContactEmail} onChange={(v) => set("aeContactEmail", v)} type="email" />
                  <Field label="AE Phone" value={formData.aeContactPhone} onChange={(v) => set("aeContactPhone", v)} />
                </>
              )}
            </Grid2>

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
                  { value: "yes", label: "Yes — any licensed processor" },
                  { value: "approved_list", label: "Yes — approved processors only" },
                  { value: "case_by_case", label: "Case by Case" },
                  { value: "no", label: "No — not permitted" },
                ]}
              />
              {formData.thirdPartyProcessingAllowed !== "no" && (
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
              <RadioGroup label="Scenario Desk Available (live verbal scenarios)" value={formData.scenarioDeskAvailable} onChange={(v) => set("scenarioDeskAvailable", v)} options={["Yes", "No"]} inline />
              {formData.scenarioDeskAvailable === "Yes" && (
                <Field label="Scenario Desk Hours" value={formData.scenarioDeskHours} onChange={(v) => set("scenarioDeskHours", v)} placeholder="e.g. M-F 8am-6pm PT" />
              )}
            </Grid2>

            <Grid2>
              <RadioGroup label="In-House Underwriting" value={formData.inHouseUnderwriting} onChange={(v) => set("inHouseUnderwriting", v)} options={["Yes — in-house", "No — outsourced"]} />
              <Field label="Condition Turnaround SLA (days)" value={formData.conditionTurnaroundDays} onChange={(v) => set("conditionTurnaroundDays", v)} type="number" placeholder="e.g. 2" />
            </Grid2>

            <Textarea label="Affiliated Business Arrangements (title, escrow, settlement services)" value={formData.affiliatedBusinessArrangements} onChange={(v) => set("affiliatedBusinessArrangements", v)} placeholder="List any affiliated companies that should be disclosed to borrowers" />
          </FormSection>
        )}

        {/* STEP: SUBMISSION REVIEW */}
        {currentStep === steps.length - 1 && (
          <FormSection title="Review & Submit" subtitle="Your profile will be reviewed before going live on the LoanBeacons platform">
            <div style={styles.reviewBox}>
              <div style={styles.reviewItem}>
                <span style={styles.reviewLabel}>Lender Type</span>
                <span style={styles.reviewValue}>{LENDER_TYPES.find((t) => t.id === formData.lenderType)?.label}</span>
              </div>
              <div style={styles.reviewItem}>
                <span style={styles.reviewLabel}>Company</span>
                <span style={styles.reviewValue}>{formData.lenderName || "—"}</span>
              </div>
              <div style={styles.reviewItem}>
                <span style={styles.reviewLabel}>Contact</span>
                <span style={styles.reviewValue}>{formData.contactName} · {formData.contactEmail}</span>
              </div>
              <div style={styles.reviewItem}>
                <span style={styles.reviewLabel}>Active States</span>
                <span style={styles.reviewValue}>{formData.statesActive.length > 0 ? formData.statesActive.join(", ") : "Not specified"}</span>
              </div>
              <div style={styles.reviewItem}>
                <span style={styles.reviewLabel}>Accepting New Brokers</span>
                <span style={styles.reviewValue}>{formData.acceptingNewBrokers || "—"}</span>
              </div>
            </div>

            <div style={styles.disclaimer}>
              By submitting, you confirm that the information provided is accurate and authorized for use on the
              LoanBeacons platform. Profiles are reviewed before publication. You will be contacted if
              clarification is needed. All compensation information is displayed in compliance with applicable
              regulations.
            </div>

            {error && (
              <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "12px", textAlign: "center" }}>
                {error}
              </div>
            )}
          </FormSection>
        )}
      </div>

      {/* ── NAVIGATION ── */}
      {currentStep > 0 && (
        <div style={styles.nav}>
          <button
            onClick={() => setCurrentStep((prev) => prev - 1)}
            style={styles.btnSecondary}
          >
            ← Back
          </button>

          <span style={{ color: "#475569", fontSize: "12px" }}>
            Step {currentStep} of {totalSteps - 1}
          </span>

          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => prev + 1)}
              style={styles.btnPrimary}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ ...styles.btnPrimary, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Submitting..." : "Submit Profile ✓"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── SUCCESS SCREEN ─────────────────────────────────────────

const SuccessScreen = ({ lenderName }) => (
  <div style={{ ...styles.container, textAlign: "center", paddingTop: "80px" }}>
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
      <a href="mailto:lenders@loanbeacons.com" style={{ color: "#e8531a" }}>
        lenders@loanbeacons.com
      </a>
    </p>
  </div>
);

// ── FORM FIELD COMPONENTS ──────────────────────────────────

const Field = ({ label, value, onChange, type = "text", placeholder, prefix, suffix }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
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
      {suffix && <span style={styles.inputAddon}>{suffix}</span>}
    </div>
  </div>
);

const Textarea = ({ label, value, onChange, placeholder }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{ ...styles.input, resize: "vertical", lineHeight: "1.5" }}
    />
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.input}>
      <option value="">Select...</option>
      {options.map((opt) =>
        typeof opt === "string" ? (
          <option key={opt} value={opt}>{opt}</option>
        ) : (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        )
      )}
    </select>
  </div>
);

const RadioGroup = ({ label, value, onChange, options, inline }) => (
  <div style={{ marginBottom: "16px" }}>
    <Label>{label}</Label>
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "6px" }}>
      {options.map((opt) => (
        <label
          key={opt}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            color: value === opt ? "#e8531a" : "#94a3b8",
            fontSize: "13px",
            fontWeight: value === opt ? "600" : "400",
          }}
        >
          <div
            onClick={() => onChange(opt)}
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              border: `2px solid ${value === opt ? "#e8531a" : "#2d3548"}`,
              background: value === opt ? "#e8531a" : "transparent",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
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
        <div
          key={item}
          onClick={() => onToggle(item)}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            border: `1px solid ${isSelected ? "#e8531a" : "#2d3548"}`,
            background: isSelected ? "#e8531a18" : "#1a1f2e",
            color: isSelected ? "#e8531a" : "#64748b",
            fontSize: "12px",
            fontWeight: isSelected ? "600" : "400",
            cursor: "pointer",
          }}
        >
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
          <div
            key={state}
            onClick={() => onToggle(state)}
            style={{
              width: "38px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              border: `1px solid ${isSelected ? "#e8531a" : "#1e2535"}`,
              background: isSelected ? "#e8531a" : "#1a1f2e",
              color: isSelected ? "#fff" : "#475569",
              fontSize: "10px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {state}
          </div>
        );
      })}
    </div>
    <div style={{ color: "#475569", fontSize: "11px", marginTop: "6px" }}>
      {selected.length} state{selected.length !== 1 ? "s" : ""} selected
    </div>
  </div>
);

const NicheGrid = ({ niches, selected, details, onToggle, onDetail }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
    {niches.map(({ key, label, detailKey, placeholder }) => {
      const isSelected = selected[key];
      return (
        <div
          key={key}
          style={{
            background: isSelected ? "#1a2035" : "#141824",
            border: `1px solid ${isSelected ? "#e8531a44" : "#1e2535"}`,
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", cursor: "pointer" }}
            onClick={() => onToggle(key)}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "4px",
                border: `2px solid ${isSelected ? "#e8531a" : "#2d3548"}`,
                background: isSelected ? "#e8531a" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isSelected && <span style={{ color: "#fff", fontSize: "12px", lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ color: isSelected ? "#f1f5f9" : "#64748b", fontWeight: isSelected ? "600" : "400", fontSize: "14px" }}>
              {label}
            </span>
          </div>
          {isSelected && (
            <div style={{ padding: "0 16px 12px" }}>
              <textarea
                value={details[detailKey] || ""}
                onChange={(e) => onDetail(detailKey, e.target.value)}
                placeholder={placeholder || `Describe your specific ${label.toLowerCase()} parameters...`}
                rows={2}
                style={{ ...styles.input, resize: "vertical", fontSize: "12px" }}
              />
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
  <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
    {children}
  </div>
);

const SectionSubhead = ({ children }) => (
  <div style={{ color: "#e8531a", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", margin: "20px 0 12px" }}>
    {children}
  </div>
);

const Grid2 = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>{children}</div>
);

const Grid4 = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "8px" }}>{children}</div>
);

// ── HELPERS ────────────────────────────────────────────────

function lenderEntityOptions(type) {
  if (type === "conventional") return ["Retail Bank", "Wholesale Lender", "Correspondent Lender", "Credit Union", "Mortgage Banker"];
  if (type === "nonqm") return ["Direct Lender", "Private Fund", "Mortgage REIT", "Correspondent", "Wholesale"];
  if (type === "hard_money") return ["Direct Lender", "Private Fund", "Family Office", "Mortgage Fund", "Private Investor"];
  return [];
}

// ── STYLES ─────────────────────────────────────────────────

const styles = {
  container: {
    minHeight: "100vh",
    background: "#0d1117",
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: "#f1f5f9",
  },
  header: {
    background: "linear-gradient(135deg, #141824 0%, #1a1f2e 100%)",
    borderBottom: "1px solid #2d3548",
    padding: "32px 48px",
    textAlign: "center",
  },
  logo: {
    color: "#e8531a",
    fontSize: "13px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "2px",
    marginBottom: "12px",
  },
  headerTitle: {
    color: "#f1f5f9",
    fontSize: "28px",
    fontWeight: "800",
    marginBottom: "8px",
  },
  headerSub: {
    color: "#64748b",
    fontSize: "13px",
    maxWidth: "560px",
    margin: "0 auto",
  },
  progressBar: {
    display: "flex",
    alignItems: "center",
    padding: "20px 48px",
    background: "#0d1117",
    borderBottom: "1px solid #1e2535",
  },
  progressDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  body: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "40px 24px",
  },
  typeCard: {
    padding: "32px 20px",
    borderRadius: "12px",
    border: "2px solid",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.2s",
  },
  input: {
    width: "100%",
    background: "#1a1f2e",
    border: "1px solid #2d3548",
    borderRadius: "6px",
    color: "#f1f5f9",
    padding: "10px 12px",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  inputAddon: {
    background: "#141824",
    border: "1px solid #2d3548",
    color: "#64748b",
    padding: "10px 10px",
    fontSize: "12px",
    borderRadius: "6px 0 0 6px",
    whiteSpace: "nowrap",
  },
  reviewBox: {
    background: "#141824",
    border: "1px solid #2d3548",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "24px",
  },
  reviewItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1e2535",
  },
  reviewLabel: { color: "#64748b", fontSize: "12px" },
  reviewValue: { color: "#f1f5f9", fontSize: "13px", fontWeight: "600" },
  disclaimer: {
    color: "#475569",
    fontSize: "11px",
    lineHeight: "1.6",
    padding: "12px 16px",
    background: "#141824",
    borderRadius: "6px",
    border: "1px solid #1e2535",
  },
  nav: {
    position: "sticky",
    bottom: 0,
    background: "#0d1117",
    borderTop: "1px solid #1e2535",
    padding: "16px 48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  btnPrimary: {
    background: "#e8531a",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "12px 28px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  btnSecondary: {
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #2d3548",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "14px",
    cursor: "pointer",
  },
};

export default LenderIntakeForm;
