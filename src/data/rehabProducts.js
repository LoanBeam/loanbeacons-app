// src/data/rehabProducts.js
// Rehab Intelligence™ — Product Data Layer
// LoanBeacons™ Module 17

export const REHAB_PRODUCTS = {
  FHA_203K_STANDARD: {
    id: 'FHA_203K_STANDARD',
    name: 'FHA 203(k) Standard',
    shortName: '203(k) Standard',
    agency: 'FHA',
    color: '#2563eb',
    badge: 'Full Rehab',

    // Repair limits
    minRepairCost: 5000,
    maxRepairCost: null, // Up to loan limit
    structuralAllowed: true,
    luxuryItemsAllowed: false,

    // HUD / Consultant
    requiresHUDConsultant: true,
    requiresLicensedContractor: true,
    requiresArchitecturalExhibits: true, // For structural work

    // LTV / Loan Limits
    maxLTVPurchase: 0.9650,    // 3.5% down
    maxLTVRefinance: 0.9750,   // based on AIV
    maxLTVCashOut: null,       // No cash-out

    // Timeline
    maxRenovationPeriod: 12,   // months
    drawsAllowed: true,
    maxDraws: 5,

    // Eligible borrowers
    minCreditScore: 580,       // FHA baseline (lender overlays may vary)
    ownerOccupiedOnly: false,  // 1-4 units; investment not eligible
    investorEligible: false,

    // Eligible work
    eligibleWork: [
      'Structural repairs and reconstruction',
      'Room additions',
      'Roofing, gutters, downspouts',
      'HVAC systems',
      'Plumbing and electrical upgrades',
      'Kitchen and bath remodels',
      'Flooring and interior finishes',
      'Energy efficiency improvements',
      'Accessibility modifications (ADA)',
      'Septic/well systems',
      'Foundation repairs',
      'Mold/lead/asbestos remediation',
      'Landscaping (functional, not cosmetic)',
      'Swimming pool repairs (existing only)',
    ],
    ineligibleWork: [
      'New swimming pools',
      'Outdoor barbecue pits / gazebos',
      'Tennis courts',
      'Satellite dishes',
      'Work that doesn\'t become part of real property',
    ],

    // Eligible property types
    eligiblePropertyTypes: ['SFR', '2-4 Unit', 'Condo (FHA approved)', 'PUD'],
    ineligiblePropertyTypes: ['Investment SFR', 'Mixed-use >25% commercial', 'Co-op'],

    // Key guideline notes
    notes: [
      'HUD-approved consultant required for all projects',
      'Contingency reserve: 10–20% of rehab costs required',
      'Up to 6 months of mortgage payments can be financed (if property uninhabitable)',
      'Bids from licensed contractors required before closing',
      'All work must be completed within 12 months of closing',
      'Requires FHA-approved appraiser for Subject-To / After-Improved Value',
    ],

    // AIV basis
    aivBasis: 'After-Improved Value appraised by FHA-approved appraiser',
    loanBasis: 'Lesser of: (1) As-is value + rehab costs, or (2) 110% of After-Improved Value',
  },

  FHA_203K_LIMITED: {
    id: 'FHA_203K_LIMITED',
    name: 'FHA 203(k) Limited',
    shortName: '203(k) Limited',
    agency: 'FHA',
    color: '#0891b2',
    badge: 'Light Rehab',

    minRepairCost: 1000,
    maxRepairCost: 35000,
    structuralAllowed: false,
    luxuryItemsAllowed: false,

    requiresHUDConsultant: false,
    requiresLicensedContractor: true,
    requiresArchitecturalExhibits: false,

    maxLTVPurchase: 0.9650,
    maxLTVRefinance: 0.9750,
    maxLTVCashOut: null,

    maxRenovationPeriod: 6,    // months
    drawsAllowed: true,
    maxDraws: 2,

    minCreditScore: 580,
    ownerOccupiedOnly: false,
    investorEligible: false,

    eligibleWork: [
      'Roofing repairs (not full replacement if structural)',
      'HVAC repair/replacement',
      'Plumbing upgrades',
      'Electrical upgrades',
      'Kitchen and bath remodels (non-structural)',
      'Flooring and interior finishes',
      'Energy efficiency improvements',
      'Exterior painting and siding repairs',
      'Window and door replacements',
      'Accessibility modifications',
      'Appliance upgrades (built-in)',
      'Minor exterior work',
    ],
    ineligibleWork: [
      'Structural repairs or additions',
      'Room additions',
      'New construction (moving/adding walls)',
      'Foundation repairs',
      'New swimming pools',
      'Work requiring relocation >30 days',
    ],

    eligiblePropertyTypes: ['SFR', '2-4 Unit', 'Condo (FHA approved)', 'PUD'],
    ineligiblePropertyTypes: ['Investment SFR', 'Mixed-use >25% commercial', 'Co-op'],

    notes: [
      'No HUD consultant required — streamlined process',
      'All repairs must be non-structural',
      'Hard cap of $35,000 total rehab costs (including contingency)',
      'Contingency reserve recommended: 10% of rehab costs',
      'No self-help — all work by licensed contractor',
      'Faster closing than Standard 203(k)',
    ],

    aivBasis: 'After-Improved Value appraised by FHA-approved appraiser',
    loanBasis: 'Lesser of: (1) As-is value + rehab costs (max $35k), or (2) FHA loan limit for area',
  },

  HOMESTYLE: {
    id: 'HOMESTYLE',
    name: 'Fannie Mae HomeStyle®',
    shortName: 'HomeStyle',
    agency: 'Fannie Mae',
    color: '#059669',
    badge: 'Conventional',

    minRepairCost: 0,
    maxRepairCost: null, // Up to conforming loan limit
    structuralAllowed: true,
    luxuryItemsAllowed: true,   // Pools, landscaping, etc.

    requiresHUDConsultant: false,
    requiresLicensedContractor: true, // Or self-help with lender approval
    requiresArchitecturalExhibits: false,

    maxLTVPurchase: 0.9700,    // 3% down conventional
    maxLTVRefinance: 0.9500,
    maxLTVCashOut: 0.8000,     // With HomeStyle Energy: 0.97 refi

    maxRenovationPeriod: 12,
    drawsAllowed: true,
    maxDraws: null,            // Lender discretion

    minCreditScore: 620,       // Fannie baseline
    ownerOccupiedOnly: false,
    investorEligible: true,    // Investment properties: max 85% LTV

    eligibleWork: [
      'Structural repairs and additions',
      'Swimming pools (new or existing)',
      'Landscaping and outdoor living',
      'Luxury upgrades (countertops, fixtures)',
      'HVAC, plumbing, electrical',
      'Roofing and windows',
      'Kitchen and bath remodels',
      'ADU (Accessory Dwelling Unit) construction',
      'Energy efficiency improvements',
      'Smart home technology',
      'Appliances',
    ],
    ineligibleWork: [
      'Work that does not permanently affix to the real property',
      'Timeshare conversions',
      'Illegal unit additions',
    ],

    eligiblePropertyTypes: ['SFR', '2-4 Unit', 'Condo (FNMA warrantable)', 'PUD', 'Manufactured (MH Advantage)'],
    ineligiblePropertyTypes: ['Co-op', 'Non-warrantable condo'],

    notes: [
      'Renovation costs cannot exceed 75% of AIV (after-improved value)',
      'Self-help (DIY) allowed with lender approval for non-structural work',
      'Investment properties eligible at max 85% LTV',
      'Can be combined with HomeStyle Energy for additional loan amount',
      'No minimum repair amount',
      'Luxury improvements (pools, outdoor kitchens) are eligible',
      'Renovation funds held in escrow; disbursed as work is completed',
    ],

    aivBasis: 'As-completed value from standard conventional appraisal',
    loanBasis: 'Lesser of: Purchase price + renovation costs OR 100% of AIV — not to exceed conforming limit',
  },

  CHOICERENOVATION: {
    id: 'CHOICERENOVATION',
    name: 'Freddie Mac CHOICERenovation®',
    shortName: 'CHOICEReno',
    agency: 'Freddie Mac',
    color: '#7c3aed',
    badge: 'Conventional',

    minRepairCost: 0,
    maxRepairCost: null,
    structuralAllowed: true,
    luxuryItemsAllowed: true,

    requiresHUDConsultant: false,
    requiresLicensedContractor: true,
    requiresArchitecturalExhibits: false,

    maxLTVPurchase: 0.9700,
    maxLTVRefinance: 0.9500,
    maxLTVCashOut: 0.8000,

    maxRenovationPeriod: 12,
    drawsAllowed: true,
    maxDraws: null,

    minCreditScore: 620,
    ownerOccupiedOnly: false,
    investorEligible: true,

    eligibleWork: [
      'Structural repairs and additions',
      'Swimming pools (new or existing)',
      'Landscaping and outdoor living',
      'Luxury upgrades',
      'HVAC, plumbing, electrical',
      'Roofing, windows, siding',
      'Kitchen and bath remodels',
      'Resilience improvements (storm shutters, flood mitigation)',
      'Energy efficiency improvements',
      'ADU construction',
      'Appliances',
    ],
    ineligibleWork: [
      'Work not permanently affixed to real property',
      'Timeshare conversions',
    ],

    eligiblePropertyTypes: ['SFR', '2-4 Unit', 'Condo (FHLMC warrantable)', 'PUD', 'Manufactured'],
    ineligiblePropertyTypes: ['Co-op', 'Non-warrantable condo'],

    notes: [
      'Renovation costs cannot exceed 75% of AIV',
      'CHOICEReno Express available for smaller projects (≤$50k or 10% AIV)',
      'CHOICEReno Express allows self-completion by borrower',
      'Resilience improvements get special treatment (storm/flood mitigation)',
      'Investment properties eligible at max 85% LTV',
      'Works well in disaster-impacted areas',
      'Renovation escrow held by lender; draws against completion',
    ],

    aivBasis: 'As-completed value from standard conventional appraisal',
    loanBasis: 'Lesser of: Purchase price + renovation costs OR 100% of AIV — not to exceed conforming limit',

    // Special CHOICEReno Express program
    expressProgram: {
      name: 'CHOICEReno Express',
      maxRepairCost: 50000,
      maxRepairPctAIV: 0.10,
      selfCompletionAllowed: true,
      note: 'Streamlined for smaller projects; borrower self-completion allowed',
    },
  },

  VA_RENOVATION: {
    id: 'VA_RENOVATION',
    name: 'VA Renovation Loan',
    shortName: 'VA Reno',
    agency: 'VA',
    color: '#dc2626',
    badge: 'VA Eligible',

    minRepairCost: 0,
    maxRepairCost: 50000,       // Most lender overlays cap at $50k
    structuralAllowed: false,   // No structural per VA guidelines
    luxuryItemsAllowed: false,

    requiresHUDConsultant: false,
    requiresLicensedContractor: true,
    requiresArchitecturalExhibits: false,

    maxLTVPurchase: 1.0000,    // 100% LTV VA
    maxLTVRefinance: 1.0000,   // VA IRRRL with renovation
    maxLTVCashOut: 0.9000,     // VA Cash-Out 90%

    maxRenovationPeriod: 4,    // months (lender overlay — varies)
    drawsAllowed: false,       // Typically single draw at completion
    maxDraws: 1,

    minCreditScore: 580,       // VA has no minimum, but lender overlay
    ownerOccupiedOnly: true,
    investorEligible: false,

    eligibleWork: [
      'HVAC repair/replacement',
      'Plumbing and electrical upgrades',
      'Roofing repairs and replacement',
      'Kitchen and bath remodels (non-structural)',
      'Flooring and interior finishes',
      'Energy efficiency improvements',
      'Accessibility/adaptive improvements for disabled veterans',
      'Window and door replacements',
      'Exterior painting and siding',
      'Safety-related repairs',
    ],
    ineligibleWork: [
      'Structural changes or additions',
      'New swimming pools or hot tubs',
      'Luxury items',
      'Work to detached structures (garages, sheds)',
      'Landscaping',
    ],

    eligiblePropertyTypes: ['SFR', '2-4 Unit (owner-occupied)', 'Condo (VA approved)', 'PUD'],
    ineligiblePropertyTypes: ['Investment property', 'Co-op', 'Manufactured (unless perm foundation)'],

    notes: [
      'Borrower must have eligible VA entitlement',
      'No down payment required (100% financing)',
      'No PMI (VA funding fee applies)',
      'Renovation funds typically held in escrow; single disbursement at completion',
      'Repairs must not be structural in nature',
      'Most lenders cap renovation at $50,000',
      'Property must meet VA MPRs after renovation',
      'Certificate of Eligibility (COE) required',
    ],

    aivBasis: 'As-completed value from VA-assigned appraiser (NOV)',
    loanBasis: 'Lesser of: Purchase price + renovation costs OR VA NOV (Notice of Value)',
  },
};

// ─────────────────────────────────────────────
// PRODUCT COMPARISON HELPERS
// ─────────────────────────────────────────────

export const PRODUCT_IDS = Object.keys(REHAB_PRODUCTS);

export const AGENCY_GROUPS = {
  FHA: ['FHA_203K_STANDARD', 'FHA_203K_LIMITED'],
  CONVENTIONAL: ['HOMESTYLE', 'CHOICERENOVATION'],
  VA: ['VA_RENOVATION'],
};

// Loan type eligibility by loan purpose
export const ELIGIBLE_BY_PURPOSE = {
  PURCHASE: ['FHA_203K_STANDARD', 'FHA_203K_LIMITED', 'HOMESTYLE', 'CHOICERENOVATION', 'VA_RENOVATION'],
  RATE_TERM_REFI: ['FHA_203K_STANDARD', 'FHA_203K_LIMITED', 'HOMESTYLE', 'CHOICERENOVATION'],
  CASH_OUT_REFI: ['HOMESTYLE', 'CHOICERENOVATION'],
  STREAMLINE: [],
};

// Renovation complexity tiers
export const COMPLEXITY_TIERS = {
  LIGHT: {
    label: 'Light Cosmetic',
    description: 'Flooring, paint, fixtures, appliances — no structural work',
    maxRepairCost: 35000,
    recommendedProducts: ['FHA_203K_LIMITED', 'HOMESTYLE', 'CHOICERENOVATION'],
  },
  MODERATE: {
    label: 'Moderate Rehab',
    description: 'Kitchen/bath remodel, HVAC, roof — non-structural improvements',
    maxRepairCost: 100000,
    recommendedProducts: ['FHA_203K_STANDARD', 'HOMESTYLE', 'CHOICERENOVATION'],
  },
  HEAVY: {
    label: 'Heavy / Structural',
    description: 'Additions, foundation work, gut renovation — structural changes',
    maxRepairCost: null,
    recommendedProducts: ['FHA_203K_STANDARD', 'HOMESTYLE', 'CHOICERENOVATION'],
  },
};

// 2024 FHA loan limits (national floor / ceiling — actual limits vary by county)
export const FHA_LOAN_LIMITS = {
  national_floor_1unit: 498257,
  national_ceiling_1unit: 1149825,
  national_floor_2unit: 637950,
  national_ceiling_2unit: 1472250,
  national_floor_3unit: 771125,
  national_ceiling_3unit: 1779525,
  national_floor_4unit: 958350,
  national_ceiling_4unit: 2211600,
};

// 2024 Conforming loan limits
export const CONFORMING_LOAN_LIMITS = {
  standard_1unit: 766550,
  high_cost_1unit: 1149825,
  standard_2unit: 981500,
  high_cost_2unit: 1472250,
  standard_3unit: 1186350,
  high_cost_3unit: 1779525,
  standard_4unit: 1474400,
  high_cost_4unit: 2211600,
};

export default REHAB_PRODUCTS;
