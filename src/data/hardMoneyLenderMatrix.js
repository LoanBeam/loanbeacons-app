// ============================================================
// hardMoneyLenderMatrix.js
// Module 6B — Last Resort Path
// Hard Money / Private Money / Bridge Lender Profiles
// Qualification is based on ARV and equity, NOT FICO and DTI
// ============================================================

export const hardMoneyLenders = [
  {
    id: "hm_001",
    name: "Apex Bridge Capital",
    type: "Direct Lender",
    category: "hard_money",
    active: true,
    acceptingNewBrokers: true,
    acceptingNewBrokersConfirmedDate: "2025-01-15",

    // === GEOGRAPHIC ===
    statesLicensed: ["CA", "TX", "FL", "AZ", "NV", "CO", "WA", "OR", "GA", "NC"],
    statesActive: ["CA", "TX", "FL", "AZ", "NV", "CO"],
    pendingStateLicenses: ["NY", "IL"],

    // === CORE QUALIFICATION ===
    qualification: {
      maxLTVonARV: 70,
      maxLTVonPurchase: 85,
      minLoanAmount: 100000,
      maxLoanAmount: 5000000,
      borrowerExperienceRequired: "none", // none | some | seasoned
      entityRequired: "LLC_preferred", // LLC_required | LLC_preferred | personal_ok
      personalGuaranteeRequired: true,
      crossCollateralizationAllowed: true,
      proofOfFundsLetterAvailable: true,
      sameDayTermSheet: true,
    },

    // === TERMS ===
    terms: {
      available: [6, 12, 18, 24], // months
      typicalFundingDays: 7,
      fastCloseCapable: true, // under 10 days
      extensionAvailable: true,
      extensionFeePercent: 1.0, // per extension
    },

    // === REHAB & CONSTRUCTION ===
    rehab: {
      rehabBudgetCapacity: 2000000,
      drawScheduleAvailable: true,
      numberOfDraws: 5,
      drawTurnaroundDays: 3,
      insuranceRequirements: {
        buildersRisk: true,
        vacantProperty: true,
        liabilityMinimum: 1000000,
      },
    },

    // === COMPENSATION ===
    compensation: {
      lenderOriginationPoints: { min: 2, max: 3 },
      lenderProcessingFee: 995,
      lenderAdminFee: 500,
      lenderExtensionFee: "1% per extension",
      maxBrokerPointsAllowed: 3,
      brokerFeeStructure: ["points", "flat_fee"],
      yspAvailable: false,
      yspTiers: [],
      totalFeeCap: null,
      prepaymentPenalty: "none",
    },

    // === PROPERTY TYPES ===
    propertyTypesAccepted: [
      "SFR",
      "2-4_unit",
      "multifamily_5plus",
      "commercial",
      "mixed_use",
      "condo",
      "non_warrantable_condo",
    ],

    // === NICHES ===
    niches: {
      fixAndFlipSpecialist: true,
      groundUpConstruction: true,
      bridgeToPermanent: true,
      foreignNational: false,
      nonWarrantableCondo: true,
      landLoans: false,
      commercialMixedUse: true,
      fastCloseUnder10Days: true,
      portfolioRepeatBorrower: true,
      highLeverageRehab: false,
      fixAndFlipDetails: "Up to 85% of purchase + 100% of rehab costs, not to exceed 70% ARV",
      bridgeToPermanentDetails: "Soft landing to DSCR or conventional perm available through preferred partners",
    },

    // === DEAL PREFERENCES ===
    dealPreferences: {
      preferredExitStrategies: ["refinance", "sale"],
      marketsActivelySought: ["CA", "TX", "FL", "AZ"],
      dealTypesToAvoid: ["land", "raw_land", "owner_occupied_primary"],
      minBorrowerExperience: "none",
    },

    // === UNDERWRITING ===
    underwriting: {
      inHouse: true,
      conditionTurnaroundDays: 2,
      ruralAppraisalPolicy: "full_appraisal_required",
      delegatedAuthority: "N/A",
    },

    // === OPERATIONS ===
    operations: {
      dedicatedAEAssigned: true,
      aeContact: "ae@apexbridgecapital.com",
      escalationContact: "deals@apexbridgecapital.com",
      thirdPartyProcessingAllowed: "yes",
      thirdPartyProcessingDetails: "Any licensed processor. No approved list required.",
      processingFeeCap: null,
      submissionPortal: "Apex Online Portal",
      scenarioDeskAvailable: true,
      scenarioDeskHours: "M-F 8am-6pm PT",
      overlappingLoanCap: null,
      affiliatedBusinessArrangements: [],
    },

    // === PLATFORM RATING (populated by LOs over time) ===
    platformRating: {
      responsiveness: null,
      accuracy: null,
      closingRate: null,
      reviewCount: 0,
    },
  },

  {
    id: "hm_002",
    name: "Ironclad Private Lending",
    type: "Private Fund",
    category: "hard_money",
    active: true,
    acceptingNewBrokers: true,
    acceptingNewBrokersConfirmedDate: "2025-02-01",

    statesLicensed: ["CA", "TX", "FL", "NY", "NJ", "CT", "MA", "PA", "IL", "WA"],
    statesActive: ["CA", "NY", "NJ", "FL", "TX"],
    pendingStateLicenses: [],

    qualification: {
      maxLTVonARV: 65,
      maxLTVonPurchase: 80,
      minLoanAmount: 250000,
      maxLoanAmount: 10000000,
      borrowerExperienceRequired: "some",
      entityRequired: "LLC_required",
      personalGuaranteeRequired: true,
      crossCollateralizationAllowed: true,
      proofOfFundsLetterAvailable: true,
      sameDayTermSheet: false,
    },

    terms: {
      available: [12, 18, 24],
      typicalFundingDays: 10,
      fastCloseCapable: false,
      extensionAvailable: true,
      extensionFeePercent: 0.75,
    },

    rehab: {
      rehabBudgetCapacity: 5000000,
      drawScheduleAvailable: true,
      numberOfDraws: 10,
      drawTurnaroundDays: 5,
      insuranceRequirements: {
        buildersRisk: true,
        vacantProperty: true,
        liabilityMinimum: 2000000,
      },
    },

    compensation: {
      lenderOriginationPoints: { min: 1.5, max: 2.5 },
      lenderProcessingFee: 1500,
      lenderAdminFee: 750,
      lenderExtensionFee: "0.75% per extension",
      maxBrokerPointsAllowed: 2,
      brokerFeeStructure: ["points"],
      yspAvailable: false,
      yspTiers: [],
      totalFeeCap: 5,
      prepaymentPenalty: "none",
    },

    propertyTypesAccepted: [
      "SFR",
      "2-4_unit",
      "multifamily_5plus",
      "commercial",
      "mixed_use",
    ],

    niches: {
      fixAndFlipSpecialist: true,
      groundUpConstruction: true,
      bridgeToPermanent: false,
      foreignNational: true,
      nonWarrantableCondo: false,
      landLoans: false,
      commercialMixedUse: true,
      fastCloseUnder10Days: false,
      portfolioRepeatBorrower: true,
      highLeverageRehab: false,
      foreignNationalDetails: "Passport + international credit report + 25% down minimum. ITIN accepted.",
      groundUpConstructionDetails: "Experience required. Minimum 3 completed projects. Lot must be owned free and clear.",
    },

    dealPreferences: {
      preferredExitStrategies: ["refinance", "sale", "construction_perm"],
      marketsActivelySought: ["NY", "CA", "FL"],
      dealTypesToAvoid: ["land", "raw_land", "first_time_flipper_over_2M"],
      minBorrowerExperience: "some",
    },

    underwriting: {
      inHouse: true,
      conditionTurnaroundDays: 3,
      ruralAppraisalPolicy: "full_appraisal_required",
      delegatedAuthority: "N/A",
    },

    operations: {
      dedicatedAEAssigned: true,
      aeContact: "submissions@ironcladlending.com",
      escalationContact: "director@ironcladlending.com",
      thirdPartyProcessingAllowed: "case_by_case",
      thirdPartyProcessingDetails: "Approved on deals over $1M. Processor must carry E&O insurance.",
      processingFeeCap: 1500,
      submissionPortal: "Email submission + DocuSign",
      scenarioDeskAvailable: true,
      scenarioDeskHours: "M-F 9am-5pm ET",
      overlappingLoanCap: 5,
      affiliatedBusinessArrangements: [],
    },

    platformRating: {
      responsiveness: null,
      accuracy: null,
      closingRate: null,
      reviewCount: 0,
    },
  },

  {
    id: "hm_003",
    name: "Velocity Bridge Funding",
    type: "Direct Lender",
    category: "hard_money",
    active: true,
    acceptingNewBrokers: true,
    acceptingNewBrokersConfirmedDate: "2025-01-28",

    statesLicensed: ["TX", "FL", "GA", "NC", "SC", "TN", "AL", "MS", "LA", "AR"],
    statesActive: ["TX", "FL", "GA", "NC", "SC", "TN"],
    pendingStateLicenses: ["VA", "MD"],

    qualification: {
      maxLTVonARV: 70,
      maxLTVonPurchase: 90,
      minLoanAmount: 75000,
      maxLoanAmount: 2000000,
      borrowerExperienceRequired: "none",
      entityRequired: "personal_ok",
      personalGuaranteeRequired: true,
      crossCollateralizationAllowed: false,
      proofOfFundsLetterAvailable: true,
      sameDayTermSheet: true,
    },

    terms: {
      available: [6, 12, 18],
      typicalFundingDays: 5,
      fastCloseCapable: true,
      extensionAvailable: true,
      extensionFeePercent: 1.5,
    },

    rehab: {
      rehabBudgetCapacity: 750000,
      drawScheduleAvailable: true,
      numberOfDraws: 3,
      drawTurnaroundDays: 2,
      insuranceRequirements: {
        buildersRisk: true,
        vacantProperty: false,
        liabilityMinimum: 500000,
      },
    },

    compensation: {
      lenderOriginationPoints: { min: 3, max: 4 },
      lenderProcessingFee: 795,
      lenderAdminFee: 0,
      lenderExtensionFee: "1.5% per extension",
      maxBrokerPointsAllowed: 4,
      brokerFeeStructure: ["points", "flat_fee"],
      yspAvailable: true,
      yspTiers: [
        { rateAbovePar: 1, yspPercent: 0.5 },
        { rateAbovePar: 2, yspPercent: 1.0 },
      ],
      totalFeeCap: null,
      prepaymentPenalty: "none",
    },

    propertyTypesAccepted: [
      "SFR",
      "2-4_unit",
      "condo",
      "townhome",
    ],

    niches: {
      fixAndFlipSpecialist: true,
      groundUpConstruction: false,
      bridgeToPermanent: true,
      foreignNational: false,
      nonWarrantableCondo: false,
      landLoans: false,
      commercialMixedUse: false,
      fastCloseUnder10Days: true,
      portfolioRepeatBorrower: true,
      highLeverageRehab: true,
      fixAndFlipDetails: "First-time flippers welcome. Entry-level investor program available in TX and FL.",
      highLeverageRehabDetails: "Up to 90% of purchase + 100% of rehab, max 70% ARV. Requires title seasoning waiver.",
      bridgeToPermanentDetails: "Soft exit to DSCR available. No seasoning requirement on bridge-to-DSCR exits.",
    },

    dealPreferences: {
      preferredExitStrategies: ["sale", "refinance"],
      marketsActivelySought: ["TX", "FL", "GA"],
      dealTypesToAvoid: ["commercial", "mixed_use", "ground_up", "land"],
      minBorrowerExperience: "none",
    },

    underwriting: {
      inHouse: true,
      conditionTurnaroundDays: 1,
      ruralAppraisalPolicy: "desk_review_accepted",
      delegatedAuthority: "N/A",
    },

    operations: {
      dedicatedAEAssigned: true,
      aeContact: "brokers@velocitybridgefunding.com",
      escalationContact: "ops@velocitybridgefunding.com",
      thirdPartyProcessingAllowed: "yes",
      thirdPartyProcessingDetails: "Any licensed processor. Processor agreement required on file.",
      processingFeeCap: 1000,
      submissionPortal: "Velocity Broker Portal",
      scenarioDeskAvailable: true,
      scenarioDeskHours: "M-F 7am-7pm CT",
      overlappingLoanCap: null,
      affiliatedBusinessArrangements: ["preferred_title_TX"],
    },

    platformRating: {
      responsiveness: null,
      accuracy: null,
      closingRate: null,
      reviewCount: 0,
    },
  },

  {
    id: "hm_004",
    name: "Meridian Private Capital",
    type: "Private Fund",
    category: "hard_money",
    active: true,
    acceptingNewBrokers: false,
    acceptingNewBrokersConfirmedDate: "2025-02-10",

    statesLicensed: ["CA", "NV", "AZ", "OR", "WA", "CO", "UT", "ID", "MT", "WY"],
    statesActive: ["CA", "NV", "AZ", "CO"],
    pendingStateLicenses: [],

    qualification: {
      maxLTVonARV: 60,
      maxLTVonPurchase: 75,
      minLoanAmount: 500000,
      maxLoanAmount: 15000000,
      borrowerExperienceRequired: "seasoned",
      entityRequired: "LLC_required",
      personalGuaranteeRequired: true,
      crossCollateralizationAllowed: true,
      proofOfFundsLetterAvailable: true,
      sameDayTermSheet: false,
    },

    terms: {
      available: [12, 24, 36],
      typicalFundingDays: 14,
      fastCloseCapable: false,
      extensionAvailable: true,
      extensionFeePercent: 0.5,
    },

    rehab: {
      rehabBudgetCapacity: 10000000,
      drawScheduleAvailable: true,
      numberOfDraws: 12,
      drawTurnaroundDays: 7,
      insuranceRequirements: {
        buildersRisk: true,
        vacantProperty: true,
        liabilityMinimum: 5000000,
      },
    },

    compensation: {
      lenderOriginationPoints: { min: 1, max: 2 },
      lenderProcessingFee: 2500,
      lenderAdminFee: 1000,
      lenderExtensionFee: "0.5% per extension",
      maxBrokerPointsAllowed: 2,
      brokerFeeStructure: ["points"],
      yspAvailable: false,
      yspTiers: [],
      totalFeeCap: 4,
      prepaymentPenalty: "3 months interest",
    },

    propertyTypesAccepted: [
      "multifamily_5plus",
      "commercial",
      "mixed_use",
      "industrial",
      "office",
      "retail",
    ],

    niches: {
      fixAndFlipSpecialist: false,
      groundUpConstruction: true,
      bridgeToPermanent: true,
      foreignNational: true,
      nonWarrantableCondo: false,
      landLoans: true,
      commercialMixedUse: true,
      fastCloseUnder10Days: false,
      portfolioRepeatBorrower: true,
      highLeverageRehab: false,
      groundUpConstructionDetails: "Minimum 10 completed ground-up projects. Shovel-ready required.",
      foreignNationalDetails: "Foreign corporations accepted. International bank references accepted in lieu of US credit.",
      landLoansDetails: "Entitled land only. Must have approved plans or active entitlement process.",
      commercialMixedUseDetails: "Mixed-use up to 20 units + retail/office on ground floor.",
    },

    dealPreferences: {
      preferredExitStrategies: ["refinance", "construction_perm", "sale"],
      marketsActivelySought: ["CA", "CO", "AZ"],
      dealTypesToAvoid: ["SFR_fix_flip", "first_time_investor"],
      minBorrowerExperience: "seasoned",
    },

    underwriting: {
      inHouse: true,
      conditionTurnaroundDays: 5,
      ruralAppraisalPolicy: "full_appraisal_required",
      delegatedAuthority: "N/A",
    },

    operations: {
      dedicatedAEAssigned: true,
      aeContact: "capital@meridianprivatecapital.com",
      escalationContact: "cio@meridianprivatecapital.com",
      thirdPartyProcessingAllowed: "yes",
      thirdPartyProcessingDetails: "Approved processors only. Submit processor for approval prior to first deal.",
      processingFeeCap: 2000,
      submissionPortal: "Meridian Secure Portal",
      scenarioDeskAvailable: true,
      scenarioDeskHours: "M-F 8am-5pm PT",
      overlappingLoanCap: 3,
      affiliatedBusinessArrangements: ["preferred_title_CA", "preferred_escrow_CA"],
    },

    platformRating: {
      responsiveness: null,
      accuracy: null,
      closingRate: null,
      reviewCount: 0,
    },
  },

  {
    id: "hm_005",
    name: "NationalBridge Direct",
    type: "Direct Lender",
    category: "hard_money",
    active: true,
    acceptingNewBrokers: true,
    acceptingNewBrokersConfirmedDate: "2025-02-15",

    statesLicensed: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    statesActive: ["AL", "AZ", "CA", "CO", "FL", "GA", "IL", "MD", "MI", "MN", "NC", "NJ", "NY", "OH", "OR", "PA", "TN", "TX", "VA", "WA"],
    pendingStateLicenses: [],

    qualification: {
      maxLTVonARV: 70,
      maxLTVonPurchase: 85,
      minLoanAmount: 50000,
      maxLoanAmount: 3000000,
      borrowerExperienceRequired: "none",
      entityRequired: "personal_ok",
      personalGuaranteeRequired: true,
      crossCollateralizationAllowed: true,
      proofOfFundsLetterAvailable: true,
      sameDayTermSheet: true,
    },

    terms: {
      available: [6, 12, 18, 24],
      typicalFundingDays: 7,
      fastCloseCapable: true,
      extensionAvailable: true,
      extensionFeePercent: 1.25,
    },

    rehab: {
      rehabBudgetCapacity: 1500000,
      drawScheduleAvailable: true,
      numberOfDraws: 6,
      drawTurnaroundDays: 3,
      insuranceRequirements: {
        buildersRisk: true,
        vacantProperty: true,
        liabilityMinimum: 1000000,
      },
    },

    compensation: {
      lenderOriginationPoints: { min: 2, max: 3.5 },
      lenderProcessingFee: 995,
      lenderAdminFee: 495,
      lenderExtensionFee: "1.25% per extension",
      maxBrokerPointsAllowed: 3,
      brokerFeeStructure: ["points", "flat_fee"],
      yspAvailable: true,
      yspTiers: [
        { rateAbovePar: 1, yspPercent: 0.5 },
        { rateAbovePar: 1.5, yspPercent: 0.75 },
        { rateAbovePar: 2, yspPercent: 1.0 },
      ],
      totalFeeCap: null,
      prepaymentPenalty: "none",
    },

    propertyTypesAccepted: [
      "SFR",
      "2-4_unit",
      "multifamily_5plus",
      "commercial",
      "mixed_use",
      "condo",
      "non_warrantable_condo",
      "townhome",
    ],

    niches: {
      fixAndFlipSpecialist: true,
      groundUpConstruction: true,
      bridgeToPermanent: true,
      foreignNational: true,
      nonWarrantableCondo: true,
      landLoans: false,
      commercialMixedUse: true,
      fastCloseUnder10Days: true,
      portfolioRepeatBorrower: true,
      highLeverageRehab: true,
      fixAndFlipDetails: "First-time to seasoned. Nationwide coverage with local appraisers in all active states.",
      foreignNationalDetails: "Passport + 3 months foreign bank statements. No US credit required.",
      nonWarrantableCondo: "Non-warrantable condos accepted with standard ARV-based qualification.",
      highLeverageRehabDetails: "Up to 90% of purchase + 100% of rehab, not to exceed 70% ARV. First-time flipper OK on deals under $500K.",
    },

    dealPreferences: {
      preferredExitStrategies: ["sale", "refinance", "construction_perm"],
      marketsActivelySought: ["all_active_states"],
      dealTypesToAvoid: ["raw_land", "gas_stations", "special_purpose_commercial"],
      minBorrowerExperience: "none",
    },

    underwriting: {
      inHouse: true,
      conditionTurnaroundDays: 2,
      ruralAppraisalPolicy: "desk_review_accepted",
      delegatedAuthority: "N/A",
    },

    operations: {
      dedicatedAEAssigned: true,
      aeContact: "brokers@nationalbridgedirect.com",
      escalationContact: "uw@nationalbridgedirect.com",
      thirdPartyProcessingAllowed: "yes",
      thirdPartyProcessingDetails: "Any licensed processor. No fee cap. Processor signs broker agreement.",
      processingFeeCap: null,
      submissionPortal: "NationalBridge Broker Portal",
      scenarioDeskAvailable: true,
      scenarioDeskHours: "M-F 7am-8pm ET, Sat 9am-3pm ET",
      overlappingLoanCap: null,
      affiliatedBusinessArrangements: [],
    },

    platformRating: {
      responsiveness: null,
      accuracy: null,
      closingRate: null,
      reviewCount: 0,
    },
  },
];

export default hardMoneyLenders;
