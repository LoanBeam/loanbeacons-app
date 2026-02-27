/**
 * parseURLA.js
 * LoanBeacons - MISMO 3.4 URLA XML Parser (browser-compatible)
 */

function getTag(node, tagName) {
  var el = node.getElementsByTagName(tagName)[0];
  return el ? (el.textContent || '').trim() : '';
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

function formatPhone(raw) {
  if (!raw) return '';
  var d = raw.replace(/\D/g, '');
  return d.length === 10 ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6) : raw;
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
    proposedMIP: '', cashToClose: '',
    ufmipFinanced: '', ufmipTotal: '', estimatedClosingCosts: '',
    liabilities: [], assets: [], totalAssets: '',
    loFirstName: '', loLastName: '', loNMLS: '', companyName: '',
  };

  var origSystem = doc.getElementsByTagName('ORIGINATION_SYSTEM')[0];
  if (origSystem) result._importMeta.losName = getTag(origSystem, 'LoanOriginationSystemName');
  var aboutVersion = doc.getElementsByTagName('ABOUT_VERSION')[0];
  if (aboutVersion) result._importMeta.fileCreated = getTag(aboutVersion, 'CreatedDatetime').split('T')[0];
  var loanIdEl = doc.getElementsByTagName('LOAN_IDENTIFIER')[0];
  if (loanIdEl) result._importMeta.loanNumber = getTag(loanIdEl, 'LoanIdentifier');

  var subjectProp = doc.getElementsByTagName('SUBJECT_PROPERTY')[0];
  if (subjectProp) {
    var addr = subjectProp.getElementsByTagName('ADDRESS')[0];
    if (addr) {
      result.streetAddress = getTag(addr, 'AddressLineText');
      result.city = getTag(addr, 'CityName');
      result.county = getTag(addr, 'CountyName');
      result.state = getTag(addr, 'StateCode');
      result.zipCode = getTag(addr, 'PostalCode');
    }
    var fips = subjectProp.getElementsByTagName('FIPS_INFORMATION')[0];
    if (fips) { result.fipsState = getTag(fips, 'FIPSStateNumericCode'); result.fipsCounty = getTag(fips, 'FIPSCountyCode'); }
    var propDetail = subjectProp.getElementsByTagName('PROPERTY_DETAIL')[0];
    if (propDetail) {
      result.occupancy = mapOccupancy(getTag(propDetail, 'PropertyUsageType'));
      var units = parseInt(getTag(propDetail, 'FinancedUnitCount')) || 1;
      var attachment = getTag(propDetail, 'AttachmentType');
      var conMethod = getTag(propDetail, 'ConstructionMethodType');
      var isPUD = getTag(propDetail, 'PUDIndicator') === 'true';
      result.propertyType = mapPropertyType(attachment, conMethod, units, isPUD);
      result.propertyValue = parseDollar(getTag(propDetail, 'PropertyEstimatedValueAmount'));
    }
    var salesContract = subjectProp.getElementsByTagName('SALES_CONTRACT_DETAIL')[0];
    if (salesContract) result.purchasePrice = parseDollar(getTag(salesContract, 'SalesContractAmount'));
    if (!result.purchasePrice && result.propertyValue) result.purchasePrice = result.propertyValue;
  }

  var termsOfLoan = doc.getElementsByTagName('TERMS_OF_LOAN')[0];
  if (termsOfLoan) {
    result.loanAmount = parseDollar(getTag(termsOfLoan, 'BaseLoanAmount'));
    result.loanPurpose = mapLoanPurpose(getTag(termsOfLoan, 'LoanPurposeType'));
    result.loanType = mapLoanType(getTag(termsOfLoan, 'MortgageType'));
    result.interestRate = parseRate(getTag(termsOfLoan, 'NoteRatePercent'));
  }

  var amortRule = doc.getElementsByTagName('AMORTIZATION_RULE')[0];
  if (amortRule) {
    var count = getTag(amortRule, 'LoanAmortizationPeriodCount');
    var ptype = getTag(amortRule, 'LoanAmortizationPeriodType');
    if (count && ptype === 'Month') result.term = count;
    else if (count && ptype === 'Year') result.term = String(parseInt(count) * 12);
  }

  var urlaDetail = doc.getElementsByTagName('URLA_DETAIL')[0];
  if (urlaDetail) {
    result.ufmipFinanced = parseDollar(getTag(urlaDetail, 'MIAndFundingFeeFinancedAmount'));
    result.ufmipTotal = parseDollar(getTag(urlaDetail, 'MIAndFundingFeeTotalAmount'));
    result.estimatedClosingCosts = parseDollar(getTag(urlaDetail, 'EstimatedClosingCostsAmount'));
  }

  var closingDetail = doc.getElementsByTagName('CLOSING_INFORMATION_DETAIL')[0];
  if (closingDetail) result.cashToClose = parseDollar(getTag(closingDetail, 'CashFromBorrowerAtClosingAmount'));

  Array.from(doc.getElementsByTagName('HOUSING_EXPENSE')).forEach(function(exp) {
    if (getTag(exp, 'HousingExpenseTimingType') !== 'Proposed') return;
    var amt = getTag(exp, 'HousingExpensePaymentAmount');
    var htype = getTag(exp, 'HousingExpenseType');
    if (htype === 'FirstMortgagePrincipalAndInterest') result.proposedPI = amt;
    else if (htype === 'RealEstateTax') result.proposedTaxes = amt;
    else if (htype === 'HomeownersInsurance') result.proposedInsurance = amt;
    else if (htype === 'MIPremium') result.proposedMIP = amt;
  });

  Array.from(doc.getElementsByTagName('PARTY')).forEach(function(party) {
    Array.from(party.getElementsByTagName('ROLE')).forEach(function(role) {
      var roleType = getTag(role, 'PartyRoleType');
      if (roleType === 'Borrower') {
        var ind = party.getElementsByTagName('INDIVIDUAL')[0];
        if (ind) {
          var nameEl = ind.getElementsByTagName('n')[0];
          if (nameEl) { result.firstName = getTag(nameEl, 'FirstName'); result.lastName = getTag(nameEl, 'LastName'); }
          Array.from(ind.getElementsByTagName('CONTACT_POINT')).forEach(function(cp) {
            var tel = cp.getElementsByTagName('CONTACT_POINT_TELEPHONE')[0];
            var email = cp.getElementsByTagName('CONTACT_POINT_EMAIL')[0];
            if (tel) result.borrowerPhone = formatPhone(getTag(tel, 'ContactPointTelephoneValue'));
            if (email) result.borrowerEmail = getTag(email, 'ContactPointEmailValue');
          });
        }
        var bd = role.getElementsByTagName('BORROWER_DETAIL')[0];
        if (bd) { result.maritalStatus = getTag(bd, 'MaritalStatusType'); result.dependentCount = getTag(bd, 'DependentCount'); }
        var totalIncome = 0;
        Array.from(role.getElementsByTagName('CURRENT_INCOME_ITEM')).forEach(function(item) {
          totalIncome += parseFloat(getTag(item, 'CurrentIncomeMonthlyTotalAmount')) || 0;
        });
        if (totalIncome > 0) result.monthlyIncome = String(totalIncome.toFixed(2));
        var employer = role.getElementsByTagName('EMPLOYER')[0];
        if (employer) {
          var leName = employer.getElementsByTagName('LEGAL_ENTITY_DETAIL')[0];
          if (leName) result.employerName = getTag(leName, 'FullName');
          var empDetail = employer.getElementsByTagName('EMPLOYMENT')[0];
          if (empDetail) {
            result.selfEmployed = getTag(empDetail, 'EmploymentBorrowerSelfEmployedIndicator') === 'true';
            result.employmentTitle = getTag(empDetail, 'EmploymentPositionDescription');
          }
        }
        Array.from(party.getElementsByTagName('TAXPAYER_IDENTIFIER')).forEach(function(ti) {
          if (getTag(ti, 'TaxpayerIdentifierType') === 'SocialSecurityNumber') {
            var ssn = getTag(ti, 'TaxpayerIdentifierValue');
            result.ssnPresent = !!(ssn && ssn.replace(/\D/g, '').length >= 9);
          }
        });
      }
      if (roleType === 'LoanOriginator') {
        var ind2 = party.getElementsByTagName('INDIVIDUAL')[0];
        if (ind2) {
          var nameEl2 = ind2.getElementsByTagName('n')[0];
          if (nameEl2) { result.loFirstName = getTag(nameEl2, 'FirstName'); result.loLastName = getTag(nameEl2, 'LastName'); }
        }
        Array.from(role.getElementsByTagName('LICENSE')).forEach(function(lic) {
          if (getTag(lic, 'LicenseAuthorityLevelType') === 'Private') result.loNMLS = getTag(lic, 'LicenseIdentifier');
        });
      }
      if (roleType === 'LoanOriginationCompany') {
        var le = party.getElementsByTagName('LEGAL_ENTITY_DETAIL')[0];
        if (le) result.companyName = getTag(le, 'FullName');
      }
    });
  });

  var totalDebts = 0;
  Array.from(doc.getElementsByTagName('LIABILITY')).forEach(function(liab) {
    var detail = liab.getElementsByTagName('LIABILITY_DETAIL')[0];
    if (!detail) return;
    var holderEl = liab.getElementsByTagName('LIABILITY_HOLDER')[0];
    var nEl = holderEl ? holderEl.getElementsByTagName('n')[0] : null;
    var holderName = nEl ? getTag(nEl, 'FullName') : (holderEl ? getTag(holderEl, 'FullName') : '');
    var pmt = parseFloat(getTag(detail, 'LiabilityMonthlyPaymentAmount')) || 0;
    var bal = parseFloat(getTag(detail, 'LiabilityUnpaidBalanceAmount')) || 0;
    var excluded = getTag(detail, 'LiabilityExclusionIndicator') === 'true';
    var payoff = getTag(detail, 'LiabilityPayoffStatusIndicator') === 'true';
    result.liabilities.push({ creditor: holderName, type: getTag(detail, 'LiabilityType'), balance: Math.round(bal), monthlyPayment: pmt, remainingMonths: parseInt(getTag(detail, 'LiabilityRemainingTermMonthsCount')) || null, excluded: excluded, payoff: payoff });
    if (!excluded && !payoff) totalDebts += pmt;
  });
  if (totalDebts > 0) result.monthlyDebts = String(totalDebts.toFixed(2));

  var totalAssets = 0;
  Array.from(doc.getElementsByTagName('ASSET')).forEach(function(asset) {
    var detail = asset.getElementsByTagName('ASSET_DETAIL')[0];
    if (!detail) return;
    if (asset.getElementsByTagName('OWNED_PROPERTY').length > 0) return;
    var holderEl = asset.getElementsByTagName('ASSET_HOLDER')[0];
    var nEl = holderEl ? holderEl.getElementsByTagName('n')[0] : null;
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
  if (parsed.employerName) fields.push('Employer');
  if (parsed.monthlyIncome) fields.push('Monthly income');
  if (parsed.loanAmount) fields.push('Loan amount');
  if (parsed.purchasePrice) fields.push('Purchase price');
  if (parsed.interestRate) fields.push('Interest rate');
  if (parsed.term) fields.push('Loan term');
  if (parsed.loanType) fields.push('Loan type');
  if (parsed.loanPurpose) fields.push('Loan purpose');
  if (parsed.streetAddress) fields.push('Property address');
  if (parsed.monthlyDebts) fields.push('Monthly debts');
  if (parsed.liabilities.length > 0) fields.push(parsed.liabilities.length + ' liabilities');
  if (parsed.assets.length > 0) fields.push(parsed.assets.length + ' assets');
  return fields;
}
