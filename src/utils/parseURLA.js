/**
 * parseURLA.js
 * LoanBeacons - MISMO 3.4 URLA XML Parser (browser-compatible)
 * v2 — namespace-safe, multi-borrower support
 */

// Namespace-safe tag getter — handles both namespaced and non-namespaced XML
function getTag(node, tagName) {
  var el = node.getElementsByTagName(tagName)[0];
  if (!el) el = node.getElementsByTagNameNS('*', tagName)[0];
  return el ? (el.textContent || '').trim() : '';
}

// Namespace-safe getAll
function getTags(node, tagName) {
  var els = Array.from(node.getElementsByTagName(tagName));
  if (els.length === 0) els = Array.from(node.getElementsByTagNameNS('*', tagName));
  return els;
}

function parseDollar(val) {
  var n = parseFloat(val);
  return (!isNaN(n) && n > 0) ? String(Math.round(n)) : '';
}

function parseRate(val) {
  var n = parseFloat(val);
  return (!isNaN(n) && n > 0) ? String(n) : '';
}

function mapOccupancy(mismo) {
  var map = { PrimaryResidence: 'Primary Residence', SecondHome: 'Second Home', Investor: 'Investment Property', Investment: 'Investment Property' };
  return map[mismo] || mismo || '';
}

function mapLoanPurpose(mismo) {
  var map = { Purchase: 'PURCHASE', Refinance: 'REFINANCE', NoCashOutRefinance: 'REFINANCE', CashOutRefinance: 'CASH_OUT', StreamlineRefinance: 'STREAMLINE' };
  return map[mismo] || '';
}

function mapLoanType(mismo) {
  var map = { Conventional: 'CONVENTIONAL', FHA: 'FHA', VA: 'VA', USDA: 'USDA', Jumbo: 'JUMBO' };
  return map[mismo] || mismo || '';
}

function mapPropertyType(attachment, construction, units, isPUD) {
  if (units >= 2 && units <= 4) return 'Multi-Family (2-4 units)';
  if (isPUD) return 'Single Family';
  if (construction === 'Manufactured') return 'Single Family';
  if (attachment === 'Attached' || attachment === 'SemiDetached') return 'Townhouse';
  return 'Single Family';
}

function mapCitizenship(mismo) {
  var map = { USCitizen: 'US_CITIZEN', PermanentResidentAlien: 'PERMANENT_RESIDENT', NonPermanentResidentAlien: 'NON_PERMANENT_RESIDENT', ForeignNational: 'FOREIGN_NATIONAL' };
  return map[mismo] || 'US_CITIZEN';
}

function formatPhone(raw) {
  if (!raw) return '';
  var d = raw.replace(/\D/g, '');
  return d.length === 10 ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6) : raw;
}

// Extract name from an INDIVIDUAL element — tries <n>, <NAME>, then direct children
function extractName(individual) {
  if (!individual) return { first: '', last: '' };
  var nEl = getTags(individual, 'n')[0] || getTags(individual, 'NAME')[0];
  return {
    first: nEl ? getTag(nEl, 'FirstName') : getTag(individual, 'FirstName'),
    last:  nEl ? getTag(nEl, 'LastName')  : getTag(individual, 'LastName'),
  };
}

export function parseURLA(xmlString) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid XML file. Please upload a valid MISMO 3.4 URLA export.');
  }

  var result = {
    _importMeta: { losName: '', fileCreated: '', loanNumber: '' },
    firstName: '', lastName: '', borrowerPhone: '', borrowerEmail: '',
    ssnPresent: false, maritalStatus: '', dependentCount: '',
    employerName: '', employmentTitle: '', selfEmployed: false,
    monthlyIncome: '', monthlyDebts: '',
    streetAddress: '', city: '', county: '', state: '', zipCode: '',
    fipsState: '', fipsCounty: '',
    propertyType: 'Single Family', occupancy: '',
    purchasePrice: '', propertyValue: '',
    loanAmount: '', loanPurpose: '', loanType: '',
    interestRate: '', term: '360',
    proposedPI: '', proposedTaxes: '', proposedInsurance: '',
    proposedMIP: '', proposedHOA: '', proposedFlood: '', proposedSecond: '',
    cashToClose: '', downPayment: '', sellerConcessions: '',
    ufmipFinanced: '', ufmipTotal: '', estimatedClosingCosts: '',
    gseInvestor: '',
    liabilities: [], assets: [], totalAssets: '',
    loFirstName: '', loLastName: '', loNMLS: '', companyName: '',
    coBorrower: null,   // backward-compat
    coBorrowers: [],    // full array of ALL co-borrowers
  };

  var origSystem = getTags(doc, 'ORIGINATION_SYSTEM')[0];
  if (origSystem) result._importMeta.losName = getTag(origSystem, 'LoanOriginationSystemName');
  var aboutVersion = getTags(doc, 'ABOUT_VERSION')[0];
  if (aboutVersion) result._importMeta.fileCreated = getTag(aboutVersion, 'CreatedDatetime').split('T')[0];
  var loanIdEl = getTags(doc, 'LOAN_IDENTIFIER')[0];
  if (loanIdEl) result._importMeta.loanNumber = getTag(loanIdEl, 'LoanIdentifier');

  var subjectProp = getTags(doc, 'SUBJECT_PROPERTY')[0];
  if (subjectProp) {
    var addr = getTags(subjectProp, 'ADDRESS')[0];
    if (addr) {
      result.streetAddress = getTag(addr, 'AddressLineText');
      result.city = getTag(addr, 'CityName');
      result.county = getTag(addr, 'CountyName');
      result.state = getTag(addr, 'StateCode');
      result.zipCode = getTag(addr, 'PostalCode');
    }
    var fips = getTags(subjectProp, 'FIPS_INFORMATION')[0];
    if (fips) { result.fipsState = getTag(fips, 'FIPSStateNumericCode'); result.fipsCounty = getTag(fips, 'FIPSCountyCode'); }
    var propDetail = getTags(subjectProp, 'PROPERTY_DETAIL')[0];
    if (propDetail) {
      result.occupancy = mapOccupancy(getTag(propDetail, 'PropertyUsageType'));
      var units = parseInt(getTag(propDetail, 'FinancedUnitCount')) || 1;
      var attachment = getTag(propDetail, 'AttachmentType');
      var conMethod = getTag(propDetail, 'ConstructionMethodType');
      var isPUD = getTag(propDetail, 'PUDIndicator') === 'true';
      result.propertyType = mapPropertyType(attachment, conMethod, units, isPUD);
      result.propertyValue = parseDollar(getTag(propDetail, 'PropertyEstimatedValueAmount'));
    }
    var salesContract = getTags(subjectProp, 'SALES_CONTRACT_DETAIL')[0];
    if (salesContract) result.purchasePrice = parseDollar(getTag(salesContract, 'SalesContractAmount'));
    if (!result.purchasePrice && result.propertyValue) result.purchasePrice = result.propertyValue;
  }

  var termsOfLoan = getTags(doc, 'TERMS_OF_LOAN')[0];
  if (termsOfLoan) {
    result.loanAmount = parseDollar(getTag(termsOfLoan, 'BaseLoanAmount'));
    result.loanPurpose = mapLoanPurpose(getTag(termsOfLoan, 'LoanPurposeType'));
    result.loanType = mapLoanType(getTag(termsOfLoan, 'MortgageType'));
    result.interestRate = parseRate(getTag(termsOfLoan, 'NoteRatePercent'));
  }

  var amortRule = getTags(doc, 'AMORTIZATION_RULE')[0];
  if (amortRule) {
    var count = getTag(amortRule, 'LoanAmortizationPeriodCount');
    var ptype = getTag(amortRule, 'LoanAmortizationPeriodType');
    if (count && ptype === 'Month') result.term = count;
    else if (count && ptype === 'Year') result.term = String(parseInt(count) * 12);
  }

  var urlaDetail = getTags(doc, 'URLA_DETAIL')[0];
  if (urlaDetail) {
    result.ufmipFinanced = parseDollar(getTag(urlaDetail, 'MIAndFundingFeeFinancedAmount'));
    result.ufmipTotal = parseDollar(getTag(urlaDetail, 'MIAndFundingFeeTotalAmount'));
    result.estimatedClosingCosts = parseDollar(getTag(urlaDetail, 'EstimatedClosingCostsAmount'));
  }

  var closingDetail = getTags(doc, 'CLOSING_INFORMATION_DETAIL')[0];
  if (closingDetail) result.cashToClose = parseDollar(getTag(closingDetail, 'CashFromBorrowerAtClosingAmount'));

  getTags(doc, 'HOUSING_EXPENSE').forEach(function(exp) {
    if (getTag(exp, 'HousingExpenseTimingType') !== 'Proposed') return;
    var amt = getTag(exp, 'HousingExpensePaymentAmount');
    var htype = getTag(exp, 'HousingExpenseType');
    if (htype === 'FirstMortgagePrincipalAndInterest') result.proposedPI = amt;
    else if (htype === 'RealEstateTax') result.proposedTaxes = amt;
    else if (htype === 'HomeownersInsurance') result.proposedInsurance = amt;
    else if (htype === 'MIPremium') result.proposedMIP = amt;
    else if (htype === 'HomeownersAssociationDues' || htype === 'HomeownersAssociationDuesAndCondominiumFees') result.proposedHOA = amt;
    else if (htype === 'FloodInsurance') result.proposedFlood = amt;
    else if (htype === 'SecondMortgagePrincipalAndInterest') result.proposedSecond = amt;
  });

  var ausTracking = getTags(doc, 'AUTOMATED_UNDERWRITING_SYSTEM')[0];
  if (ausTracking) {
    var ausType = getTag(ausTracking, 'AutomatedUnderwritingSystemType');
    if (ausType === 'DU' || ausType === 'DesktopUnderwriter') result.gseInvestor = 'FANNIE';
    else if (ausType === 'LP' || ausType === 'LoanProspector' || ausType === 'LoanProductAdvisor') result.gseInvestor = 'FREDDIE';
  }
  if (!result.gseInvestor) {
    var loanProductData = getTags(doc, 'LOAN_PRODUCT_DATA')[0];
    if (loanProductData) {
      var gseLoanType = getTag(loanProductData, 'GseLoanType');
      if (gseLoanType === 'FannieMae') result.gseInvestor = 'FANNIE';
      else if (gseLoanType === 'FreddieMac') result.gseInvestor = 'FREDDIE';
    }
  }

  var salesContractDetail = getTags(doc, 'SALES_CONTRACT_DETAIL')[0];
  if (salesContractDetail) {
    var dpAmt = parseDollar(getTag(salesContractDetail, 'DownPaymentAmount'));
    if (dpAmt) result.downPayment = dpAmt;
    var scAmt = parseDollar(getTag(salesContractDetail, 'SalesContractAmount'));
    if (scAmt) result.purchasePrice = scAmt;
  }
  var sellerConc = getTags(doc, 'SELLER_CONCESSION')[0];
  if (sellerConc) {
    var concAmt = parseDollar(getTag(sellerConc, 'SalesContractSellerConcessionAmount'));
    if (concAmt) result.sellerConcessions = concAmt;
  }

  // ── BORROWER EXTRACTION ─────────────────────────────────────────────────────
  // Use PURCHASE_CREDITS as a sanity check — then find all BORROWER elements.
  // Each <BORROWER> is the direct child of a Borrower <ROLE>.
  // DOM path up: BORROWER.parentNode = ROLE, .parentNode = ROLES, .parentNode = PARTY
  var allBorrowerEls = getTags(doc, 'BORROWER');
  console.log('[parseURLA] Found', allBorrowerEls.length, 'BORROWER elements');

  var coBorrowersList = [];

  allBorrowerEls.forEach(function(borrowerEl, idx) {
    var isCoBorrower = idx > 0;

    // Walk up DOM to find the containing PARTY
    var roleEl  = borrowerEl.parentNode;
    var rolesEl = roleEl  ? roleEl.parentNode  : null;
    var partyEl = rolesEl ? rolesEl.parentNode : null;

    var roleLabel = (roleEl && roleEl.getAttribute) ? (roleEl.getAttribute('xlink:label') || '') : '';
    console.log('[parseURLA] Borrower', idx, '— roleLabel:', roleLabel, '— partyEl tag:', partyEl ? partyEl.localName : 'null');

    // Get INDIVIDUAL from PARTY
    var ind = partyEl ? getTags(partyEl, 'INDIVIDUAL')[0] : null;
    var name = extractName(ind);
    console.log('[parseURLA] Borrower', idx, '— name:', name.first, name.last);

    // Contact
    var parsedPhone = '', parsedEmail = '';
    if (ind) {
      getTags(ind, 'CONTACT_POINT').forEach(function(cp) {
        var tel   = getTags(cp, 'CONTACT_POINT_TELEPHONE')[0];
        var email = getTags(cp, 'CONTACT_POINT_EMAIL')[0];
        if (tel && !parsedPhone)   parsedPhone = formatPhone(getTag(tel, 'ContactPointTelephoneValue'));
        if (email && !parsedEmail) parsedEmail = getTag(email, 'ContactPointEmailValue');
      });
    }

    // BORROWER_DETAIL
    var bd  = getTags(borrowerEl, 'BORROWER_DETAIL')[0];
    var dob = bd ? getTag(bd, 'BorrowerBirthDate') : '';

    // Citizenship
    var decl = getTags(borrowerEl, 'DECLARATION_DETAIL')[0];
    var citizenship = mapCitizenship(decl ? getTag(decl, 'CitizenshipResidencyType') : 'USCitizen');

    // Income
    var totalIncome = 0;
    getTags(borrowerEl, 'CURRENT_INCOME_ITEM').forEach(function(item) {
      totalIncome += parseFloat(getTag(item, 'CurrentIncomeMonthlyTotalAmount')) || 0;
    });
    console.log('[parseURLA] Borrower', idx, '— income:', totalIncome);

    // Employer
    var employer = getTags(borrowerEl, 'EMPLOYER')[0];
    var employerName = '';
    if (employer) {
      var leName = getTags(employer, 'LEGAL_ENTITY_DETAIL')[0];
      if (leName) employerName = getTag(leName, 'FullName');
    }

    if (!isCoBorrower) {
      result.firstName     = name.first;
      result.lastName      = name.last;
      result.borrowerPhone = parsedPhone;
      result.borrowerEmail = parsedEmail;
      result.maritalStatus  = bd ? getTag(bd, 'MaritalStatusType') : '';
      result.dependentCount = bd ? getTag(bd, 'DependentCount')    : '';
      result.employerName   = employerName;
      if (employer) {
        var empDetail = getTags(employer, 'EMPLOYMENT')[0];
        if (empDetail) {
          result.selfEmployed    = getTag(empDetail, 'EmploymentBorrowerSelfEmployedIndicator') === 'true';
          result.employmentTitle = getTag(empDetail, 'EmploymentPositionDescription');
        }
      }
      if (totalIncome > 0) result.monthlyIncome = String(totalIncome.toFixed(2));
      if (partyEl) {
        getTags(partyEl, 'TAXPAYER_IDENTIFIER').forEach(function(ti) {
          if (getTag(ti, 'TaxpayerIdentifierType') === 'SocialSecurityNumber') {
            var ssn = getTag(ti, 'TaxpayerIdentifierValue');
            result.ssnPresent = !!(ssn && ssn.replace(/\D/g, '').length >= 9);
          }
        });
      }
    } else {
      var cbRecord = {
        firstName:             name.first,
        lastName:              name.last,
        citizenship:           citizenship,
        dateOfBirth:           dob,
        monthlyIncome:         totalIncome > 0 ? String(totalIncome.toFixed(2)) : '',
        employerName:          employerName,
        phone:                 parsedPhone,
        email:                 parsedEmail,
        sharesJointCreditWith: null,
        _roleLabel:            roleLabel,
      };
      coBorrowersList.push(cbRecord);
      if (!result.coBorrower) {
        result.coBorrower = { firstName: name.first, lastName: name.last, monthlyIncome: cbRecord.monthlyIncome };
      }
    }
  });

  // Joint credit relationships
  getTags(doc, 'RELATIONSHIP').forEach(function(rel) {
    var arc  = (rel.getAttribute && rel.getAttribute('xlink:arcrole')) || '';
    var from = (rel.getAttribute && rel.getAttribute('xlink:from'))    || '';
    var to   = (rel.getAttribute && rel.getAttribute('xlink:to'))      || '';
    if (arc.indexOf('SharesJointCreditReportWith') !== -1) {
      coBorrowersList.forEach(function(cb) {
        if (cb._roleLabel === from) cb.sharesJointCreditWith = to;
        if (cb._roleLabel === to)   cb.sharesJointCreditWith = from;
      });
    }
  });

  result.coBorrowers = coBorrowersList.map(function(cb) {
    return {
      firstName: cb.firstName, lastName: cb.lastName,
      citizenship: cb.citizenship, dateOfBirth: cb.dateOfBirth,
      monthlyIncome: cb.monthlyIncome, employerName: cb.employerName,
      phone: cb.phone, email: cb.email,
      sharesJointCreditWith: cb.sharesJointCreditWith,
    };
  });
  console.log('[parseURLA] coBorrowers extracted:', result.coBorrowers.length, result.coBorrowers.map(function(cb){ return cb.firstName + ' ' + cb.lastName; }));

  // LO and Company
  getTags(doc, 'PARTY').forEach(function(party) {
    getTags(party, 'ROLE').forEach(function(role) {
      var rd = getTags(role, 'ROLE_DETAIL')[0];
      var roleType = rd ? getTag(rd, 'PartyRoleType') : '';
      if (roleType === 'LoanOriginator') {
        var loInd = getTags(party, 'INDIVIDUAL')[0];
        if (loInd) { var n2 = extractName(loInd); result.loFirstName = n2.first; result.loLastName = n2.last; }
        getTags(role, 'LICENSE').forEach(function(lic) {
          if (getTag(lic, 'LicenseAuthorityLevelType') === 'Private') result.loNMLS = getTag(lic, 'LicenseIdentifier');
        });
      }
      if (roleType === 'LoanOriginationCompany') {
        var le = getTags(party, 'LEGAL_ENTITY_DETAIL')[0];
        if (le) result.companyName = getTag(le, 'FullName');
      }
    });
  });

  // Liabilities
  var totalDebts = 0;
  getTags(doc, 'LIABILITY').forEach(function(liab) {
    var detail = getTags(liab, 'LIABILITY_DETAIL')[0];
    if (!detail) return;
    var holderEl = getTags(liab, 'LIABILITY_HOLDER')[0];
    var nEl = holderEl ? getTags(holderEl, 'n')[0] : null;
    var holderName = nEl ? getTag(nEl, 'FullName') : (holderEl ? getTag(holderEl, 'FullName') : '');
    var pmt = parseFloat(getTag(detail, 'LiabilityMonthlyPaymentAmount')) || 0;
    var bal = parseFloat(getTag(detail, 'LiabilityUnpaidBalanceAmount')) || 0;
    var excluded = getTag(detail, 'LiabilityExclusionIndicator') === 'true';
    var payoff = getTag(detail, 'LiabilityPayoffStatusIndicator') === 'true';
    result.liabilities.push({ creditor: holderName, type: getTag(detail, 'LiabilityType'), balance: Math.round(bal), monthlyPayment: pmt, remainingMonths: parseInt(getTag(detail, 'LiabilityRemainingTermMonthsCount')) || null, excluded: excluded, payoff: payoff });
    if (!excluded && !payoff) totalDebts += pmt;
  });
  if (totalDebts > 0) result.monthlyDebts = String(totalDebts.toFixed(2));

  // Assets
  var totalAssets = 0;
  getTags(doc, 'ASSET').forEach(function(asset) {
    var detail = getTags(asset, 'ASSET_DETAIL')[0];
    if (!detail) return;
    if (getTags(asset, 'OWNED_PROPERTY').length > 0) return;
    var holderEl = getTags(asset, 'ASSET_HOLDER')[0];
    var nEl = holderEl ? getTags(holderEl, 'n')[0] : null;
    var holderName = nEl ? getTag(nEl, 'FullName') : (holderEl ? getTag(holderEl, 'FullName') : '');
    var value = parseFloat(getTag(detail, 'AssetCashOrMarketValueAmount')) || 0;
    totalAssets += value;
    result.assets.push({ institution: holderName, type: getTag(detail, 'AssetType'), value: Math.round(value) });
  });
  if (totalAssets > 0) result.totalAssets = String(Math.round(totalAssets));

  return result;
}

export function getImportSummary(parsed) {
  var fields = [];
  if (parsed.firstName || parsed.lastName) fields.push('Borrower name');
  if (parsed.coBorrowers && parsed.coBorrowers.length > 0)
    fields.push(parsed.coBorrowers.length + ' co-borrower' + (parsed.coBorrowers.length > 1 ? 's' : '') + ' (' + parsed.coBorrowers.map(function(cb){ return cb.firstName; }).filter(Boolean).join(', ') + ')');
  else if (parsed.coBorrower && parsed.coBorrower.firstName)
    fields.push('Co-borrower name');
  if (parsed.employerName)                 fields.push('Employer');
  if (parsed.monthlyIncome)                fields.push('Monthly income');
  if (parsed.loanAmount)                   fields.push('Loan amount');
  if (parsed.purchasePrice)                fields.push('Purchase price');
  if (parsed.downPayment)                  fields.push('Down payment');
  if (parsed.sellerConcessions)            fields.push('Seller concessions');
  if (parsed.interestRate)                 fields.push('Interest rate');
  if (parsed.term)                         fields.push('Loan term');
  if (parsed.loanType)                     fields.push('Loan type');
  if (parsed.loanPurpose)                  fields.push('Loan purpose');
  if (parsed.gseInvestor)                  fields.push('GSE investor (' + parsed.gseInvestor + ')');
  if (parsed.streetAddress)               fields.push('Property address');
  if (parsed.proposedTaxes)               fields.push('Property taxes');
  if (parsed.proposedInsurance)           fields.push('Homeowners insurance');
  if (parsed.proposedMIP)                 fields.push('MIP/PMI');
  if (parsed.proposedHOA)                 fields.push('HOA dues');
  if (parsed.proposedFlood)               fields.push('Flood insurance');
  if (parsed.monthlyDebts)                fields.push('Monthly debts');
  if (parsed.liabilities.length > 0)      fields.push(parsed.liabilities.length + ' liabilities');
  if (parsed.assets.length > 0)           fields.push(parsed.assets.length + ' assets');
  if (parsed.cashToClose)                 fields.push('Cash to close');
  return fields;
}
