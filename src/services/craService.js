/**
 * ============================================================
 * LoanBeacons CRA Eligibility Intelligence™
 * src/services/craService.js
 * Version: 1.0.1 | Module 12
 * February 2026
 * ============================================================
 */

import { db } from '../firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// ─── Constants ───────────────────────────────────────────────────────────────

const HUD_EFFECTIVE_YEAR = 2025;
const HUD_EXPIRY_WARNING_DAYS = 60;
const FFIEC_DATA_YEAR = 2025;
const HIGH_MINORITY_THRESHOLD = 50;
const ACS_YEAR = 2023;
const CACHE_PREFIX = 'lb_cra_';
const HUD_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI2IiwianRpIjoiNGRjMDNmMGYzMTc0ZDk1MjZlYmI5NjM2NmY2Y2VjMDA4NmIyZjE3NTAzN2M0YjkwOGE5MTYzOWM5Nzc0ZGEzYWU4OTU5ZTdlYzcwZTkyNjciLCJpYXQiOjE3NzIxMTgwODMuNDM1MTA0LCJuYmYiOjE3NzIxMTgwODMuNDM1MTA4LCJleHAiOjIwODc2NTA4ODMuNDMwNTMxLCJzdWIiOiIxMjEwMzIiLCJzY29wZXMiOltdfQ.BhNN6s73PWhAvHZZP6xv3dBdxgq3xerTUImeikijzL2HC2d4ewyueCeEKkyZ-tItvFr-TPNvm1b0rwmaQL60-A';

// ─── Tract Income Level Map ──────────────────────────────────────────────────

const TRACT_INCOME_LEVELS = {
  1: { code: 'LOW',      label: 'Low Income Tract',      color: '#dc2626', isLowMod: true  },
  2: { code: 'MODERATE', label: 'Moderate Income Tract', color: '#d97706', isLowMod: true  },
  3: { code: 'MIDDLE',   label: 'Middle Income Tract',   color: '#2563eb', isLowMod: false },
  4: { code: 'UPPER',    label: 'Upper Income Tract',    color: '#16a34a', isLowMod: false },
  5: { code: 'UNKNOWN',  label: 'Income Level Unknown',  color: '#6b7280', isLowMod: false },
};

// ─── API URLs ─────────────────────────────────────────────────────────────────

const IS_DEV = true;

const CENSUS_GEOCODER_URL = IS_DEV
  ? '/census-geocoder/geocoder/geographies/address'
  : 'https://geocoding.geo.census.gov/geocoder/geographies/address';

const ACS_API_BASE = IS_DEV
  ? '/census-acs/data'
  : 'https://api.census.gov/data';

const HUD_API_BASE = IS_DEV
  ? '/hud-api/hudapi/public'
  : 'https://www.huduser.gov/hudapi/public';

const FFIEC_GEOCODER_URL = IS_DEV
  ? '/ffiec-api/api/census/tract'
  : 'https://ffiec.cfpb.gov/api/census/tract';

// ─── Utility Helpers ─────────────────────────────────────────────────────────

function padFIPS(value, length) {
  return String(value || '').padStart(length, '0');
}

function buildFullTractFIPS(stateFips, countyFips, tractCode) {
  return padFIPS(stateFips, 2) + padFIPS(countyFips, 3) + padFIPS(tractCode, 6);
}

function daysUntil(dateString) {
  const target = new Date(dateString);
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function getNextHUDReleaseDate() {
  const now = new Date();
  const year = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-06-01`;
}

function r1(n) { return Math.round(n * 10) / 10; }
function rDollar(n) { return Math.round(n); }

// ─── Session Cache ───────────────────────────────────────────────────────────

function getCached(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed._cachedAt > 3600000) return null;
    return parsed;
  } catch { return null; }
}

function setCache(key, data) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ...data, _cachedAt: Date.now() }));
  } catch { /* storage full */ }
}

// ─── Step 1: Geocode Address → Tract ─────────────────────────────────────────

async function geocodeAddress(streetAddress, city, state, zipCode) {
  const params = new URLSearchParams({
    street: streetAddress,
    city,
    state,
    zip: zipCode,
    benchmark: 'Public_AR_Census2020',
    vintage: 'Census2020_Census2020',
    layers: 'Census Tracts',
    format: 'json',
  });

  const response = await fetch(`${CENSUS_GEOCODER_URL}?${params}`);
  if (!response.ok) throw new Error(`Census Geocoder HTTP ${response.status}`);

  const data = await response.json();
  const matches = data?.result?.addressMatches;
  if (!matches || matches.length === 0) throw new Error('Address could not be geocoded — no matches returned');

  const match = matches[0];
  const geo = match.geographies?.['Census Tracts']?.[0];
  if (!geo) throw new Error('Census tract not found for this address');

  const stateFips  = padFIPS(geo.STATE, 2);
  const countyFips = padFIPS(geo.COUNTY, 3);
  const tractCode  = padFIPS(geo.TRACT, 6);

  return {
    addressNormalized: match.matchedAddress,
    latitude:  match.coordinates?.y,
    longitude: match.coordinates?.x,
    stateFips,
    countyFips,
    tractCode,
    fullTractFIPS: buildFullTractFIPS(stateFips, countyFips, tractCode),
    countyName: geo.BASENAME || '',
  };
}

// ─── Step 2: FFIEC Tract Metrics ─────────────────────────────────────────────

async function getFFIECTractMetrics(stateFips, countyFips, tractCode) {
  try {
    const paddedState = String(stateFips).padStart(2, '0');
    const paddedCounty = String(countyFips).padStart(3, '0');
    const paddedTract = String(tractCode).padStart(6, '0');

    // Fetch tract income + minority data in one ACS call
    const url = `${ACS_API_BASE}/${ACS_YEAR}/acs/acs5?get=B19013_001E,B02001_001E,B02001_002E&for=tract:${paddedTract}&in=state:${paddedState}%20county:${paddedCounty}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ACS Tract HTTP ${response.status}`);
    const data = await response.json();
    // Row 0 is headers, row 1 is data
    const tractMfi = parseInt(data?.[1]?.[0] || 0);
    const totalPop = parseInt(data?.[1]?.[1] || 0);
    const whitePop = parseInt(data?.[1]?.[2] || 0);
    const minorityPct = totalPop > 0 ? r1((totalPop - whitePop) / totalPop * 100) : 0;

    // Fetch county AMI for ratio calculation
    const countyUrl = `${ACS_API_BASE}/${ACS_YEAR}/acs/acs5?get=B19013_001E&for=county:${paddedCounty}&in=state:${paddedState}`;
    const countyRes = await fetch(countyUrl);
    const countyData = await countyRes.json();
    const countyMfi = parseInt(countyData?.[1]?.[0] || 0);

    // Derive income level from tract/county ratio
    const tractMfiPct = countyMfi > 0 ? r1(tractMfi / countyMfi * 100) : 100;
    let incomeLevelCode;
    if (tractMfiPct < 50) incomeLevelCode = 1;        // LOW
    else if (tractMfiPct < 80) incomeLevelCode = 2;   // MODERATE
    else if (tractMfiPct < 120) incomeLevelCode = 3;  // MIDDLE
    else incomeLevelCode = 4;                          // UPPER

    const incomeLevel = TRACT_INCOME_LEVELS[incomeLevelCode] || TRACT_INCOME_LEVELS[5];

    return {
      tractIncomeLevelCode: incomeLevelCode,
      tractIncomeLevel: incomeLevel.code,
      tractIncomeLevelLabel: incomeLevel.label,
      tractIncomeLevelColor: incomeLevel.color,
      isLowModTract: incomeLevel.isLowMod,
      tractMinorityPct: minorityPct,
      tractMfiPct: tractMfiPct,
      msaMfi: countyMfi,
      msaCode: '',
      msaName: '',
    };
  } catch (err) {
    console.warn('[CRAService] ACS Tract metrics failed, using defaults:', err.message);
    return {
      tractIncomeLevelCode: 5,
      tractIncomeLevel: 'UNKNOWN',
      tractIncomeLevelLabel: 'Income Level Unavailable',
      tractIncomeLevelColor: '#6b7280',
      isLowModTract: false,
      tractMinorityPct: 0,
      tractMfiPct: 100,
      msaMfi: 0,
      msaCode: '',
      msaName: '',
      _ffiecFailed: true,
    };
  }
}

// ─── Step 3: HUD Area Median Income ──────────────────────────────────────────

 async function getHUDAMI(stateFips, countyFips, msaMfi = 0) {
  try {
    const paddedState = String(stateFips).padStart(2, '0');
    const paddedCounty = String(countyFips).padStart(3, '0');
    const url = `${ACS_API_BASE}/${ACS_YEAR}/acs/acs5?get=B19013_001E&for=county:${paddedCounty}&in=state:${paddedState}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ACS AMI HTTP ${response.status}`);
    const data = await response.json();
    // data is [["B19013_001E","state","county"],["85000","13","067"]]
    const amiOverall = parseInt(data?.[1]?.[0] || 0);
    if (amiOverall > 0) return buildAMIObject(amiOverall);
    throw new Error('ACS returned zero AMI');
  } catch (err) {
    console.warn('[CRAService] ACS AMI failed, falling back to FFIEC MSA MFI:', err.message);
    if (msaMfi > 0) return { ...buildAMIObject(msaMfi), _hudFallback: true };
    return { amiOverall: 0, ami80: 0, ami100: 0, ami150: 0, _hudFailed: true };
  }
}

function buildAMIObject(amiOverall) {
  return {
    amiOverall: rDollar(amiOverall),
    ami80:  rDollar(amiOverall * 0.80),
    ami100: rDollar(amiOverall),
    ami120: rDollar(amiOverall * 1.20),
    ami150: rDollar(amiOverall * 1.50),
  };
}

function buildMFIObject(msaMfi, tractMfiPct) {
  const tractEstMfi = rDollar(msaMfi * (tractMfiPct / 100));
  return {
    msaMfi: rDollar(msaMfi),
    tractEstimatedMfi: tractEstMfi,
    mfi80:  rDollar(tractEstMfi * 0.80),
    mfi100: tractEstMfi,
    mfi150: rDollar(tractEstMfi * 1.50),
  };
}

// ─── Step 4: ACS Demographics ────────────────────────────────────────────────

async function getACSDemographics(stateFips, countyFips, tractCode) {
  const variables = ['B01003_001E', 'B03003_003E', 'B02001_003E', 'B02001_005E', 'B02001_006E'].join(',');
  const url = `${ACS_API_BASE}/${ACS_YEAR}/acs/acs5?get=${variables}&for=tract:${tractCode}&in=state:${stateFips}%20county:${countyFips}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ACS API HTTP ${response.status}`);
    const rows = await response.json();
    if (!rows || rows.length < 2) throw new Error('ACS returned no data');

    const headers = rows[0];
    const values  = rows[1];
    const get = (v) => { const i = headers.indexOf(v); return i >= 0 ? Math.max(0, parseInt(values[i]) || 0) : 0; };

    const totalPop     = get('B01003_001E');
    const hispanic     = get('B03003_003E');
    const black        = get('B02001_003E');
    const asianPacific = get('B02001_005E') + get('B02001_006E');
    const safePct = (c) => totalPop > 0 ? r1((c / totalPop) * 100) : 0;

    return {
      totalPopulation: totalPop,
      hispanic:     { count: hispanic,     pct: safePct(hispanic)     },
      black:        { count: black,        pct: safePct(black)        },
      asianPacific: { count: asianPacific, pct: safePct(asianPacific) },
    };
  } catch (err) {
    console.warn('[CRAService] ACS failed:', err.message);
    return {
      totalPopulation: 0,
      hispanic:     { count: 0, pct: 0 },
      black:        { count: 0, pct: 0 },
      asianPacific: { count: 0, pct: 0 },
      _acsFailed: true,
    };
  }
}

// ─── Step 5: Derived Flags ───────────────────────────────────────────────────

function buildFlags({ tractMinorityPct, isLowModTract, demographics, ami, borrowerMonthlyIncome }) {
  const isHighMinorityTract = tractMinorityPct >= HIGH_MINORITY_THRESHOLD;
  const isHighHispanicTract = demographics?.hispanic?.pct >= 25;
  const isHighBlackTract    = demographics?.black?.pct >= 25;
  const isHighAsianTract    = demographics?.asianPacific?.pct >= 25;

  let borrowerAmiPct = null;
  let borrowerAmiTier = null;

  if (borrowerMonthlyIncome > 0 && ami?.amiOverall > 0) {
    const annualIncome = borrowerMonthlyIncome * 12;
    borrowerAmiPct = r1((annualIncome / ami.amiOverall) * 100);
    if (borrowerAmiPct <= 50)       borrowerAmiTier = 'VERY_LOW';
    else if (borrowerAmiPct <= 80)  borrowerAmiTier = 'LOW';
    else if (borrowerAmiPct <= 100) borrowerAmiTier = 'MODERATE';
    else if (borrowerAmiPct <= 120) borrowerAmiTier = 'ABOVE_MOD';
    else if (borrowerAmiPct <= 150) borrowerAmiTier = 'MIDDLE';
    else                             borrowerAmiTier = 'ABOVE_LIMIT';
  }

  const nextRelease = getNextHUDReleaseDate();
  const daysToRefresh = daysUntil(nextRelease);
  const hudExpirationWarning = daysToRefresh <= HUD_EXPIRY_WARNING_DAYS;

  return {
    isLowModTract,
    isHighMinorityTract,
    isHighHispanicTract,
    isHighBlackTract,
    isHighAsianTract,
    borrowerAmiPct,
    borrowerAmiTier,
    meetsHomeReady:    borrowerAmiPct !== null && borrowerAmiPct <= 80,
    meetsHomePossible: borrowerAmiPct !== null && borrowerAmiPct <= 80,
    meetsMostDPA:      borrowerAmiPct !== null && borrowerAmiPct <= 120,
    meetsUSDAIncome:   borrowerAmiPct !== null && borrowerAmiPct <= 115,
    hudEffectiveYear: HUD_EFFECTIVE_YEAR,
    nextHudRelease: nextRelease,
    hudExpirationWarning,
    hudExpirationMessage: hudExpirationWarning
      ? `HUD income limits update in ~${daysToRefresh} days. Lock AMI-dependent programs soon.`
      : null,
  };
}

// ─── Main Export: buildCRASnapshot ───────────────────────────────────────────

export async function buildCRASnapshot(addressObj, borrowerMonthlyIncome = 0) {
  const { streetAddress, city, state, zipCode } = addressObj;
  if (!streetAddress || !city || !state || !zipCode) {
    throw new Error('CRAService: incomplete address — need street, city, state, zip');
  }

  const cacheKey = `${streetAddress}_${zipCode}`.replace(/\s+/g, '_').toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) {
    if (borrowerMonthlyIncome > 0 && cached.incomeData) {
      cached.flags = buildFlags({
        tractMinorityPct: cached.tractMetrics.tractMinorityPct,
        isLowModTract: cached.tractMetrics.isLowModTract,
        demographics: cached.demographics,
        ami: cached.incomeData,
        borrowerMonthlyIncome,
      });
    }
    console.log('[CRAService] Cache hit for:', cacheKey);
    return cached;
  }

  console.log('[CRAService] Geocoding address...');
  const geo = await geocodeAddress(streetAddress, city, state, zipCode);
  const { stateFips, countyFips, tractCode, fullTractFIPS } = geo;
  console.log(`[CRAService] Tract resolved: ${fullTractFIPS}`);

  console.log('[CRAService] Fetching FFIEC, HUD, ACS in parallel...');
  const [tractMetrics, demographics] = await Promise.all([
    getFFIECTractMetrics(stateFips, countyFips, tractCode),
    getACSDemographics(stateFips, countyFips, tractCode),
  ]);

  const incomeData = await getHUDAMI(stateFips, countyFips, tractMetrics.msaMfi);
  const mfiData    = buildMFIObject(tractMetrics.msaMfi, tractMetrics.tractMfiPct);

  const flags = buildFlags({
    tractMinorityPct: tractMetrics.tractMinorityPct,
    isLowModTract: tractMetrics.isLowModTract,
    demographics,
    ami: incomeData,
    borrowerMonthlyIncome,
  });

  const snapshot = {
    effectiveYear: HUD_EFFECTIVE_YEAR,
    acsYear: ACS_YEAR,
    resolvedAt: new Date().toISOString(),
    geography: {
      addressNormalized: geo.addressNormalized,
      stateFips, countyFips, tractCode, fullTractFIPS,
      countyName: geo.countyName,
      msaCode: tractMetrics.msaCode,
      msaName: tractMetrics.msaName,
      latitude: geo.latitude,
      longitude: geo.longitude,
    },
    tractMetrics: {
      tractIncomeLevel:      tractMetrics.tractIncomeLevel,
      tractIncomeLevelLabel: tractMetrics.tractIncomeLevelLabel,
      tractIncomeLevelColor: tractMetrics.tractIncomeLevelColor,
      isLowModTract:         tractMetrics.isLowModTract,
      tractMinorityPct:      r1(tractMetrics.tractMinorityPct),
      tractMfiPct:           tractMetrics.tractMfiPct,
    },
    incomeData: { ...incomeData, ...mfiData },
    demographics,
    flags,
    source: {
      ffiec:    `FFIEC CRA Data ${FFIEC_DATA_YEAR}`,
      hud:      `HUD Income Limits FY${HUD_EFFECTIVE_YEAR}`,
      acs:      `U.S. Census ACS 5-Year ${ACS_YEAR}`,
      geocoder: 'U.S. Census Geocoder 2020',
    },
    dataQuality: {
      ffiecAvailable:    !tractMetrics._ffiecFailed,
      hudAvailable:      !incomeData._hudFailed && !incomeData._hudFallback,
      acsAvailable:      !demographics._acsFailed,
      fullDataAvailable: !tractMetrics._ffiecFailed && !incomeData._hudFailed && !demographics._acsFailed,
    },
  };

  setCache(cacheKey, snapshot);
  console.log('[CRAService] ✅ Snapshot built for:', fullTractFIPS, snapshot.flags);
  return snapshot;
}

// ─── Firestore Save ──────────────────────────────────────────────────────────

export async function saveCRASnapshotToScenario(scenarioId, snapshot) {
  if (!scenarioId || !snapshot) return;
  try {
    const ref = doc(db, 'scenarios', scenarioId);
    await setDoc(ref, { cra_snapshot: { ...snapshot, savedAt: serverTimestamp() } }, { merge: true });
    console.log('[CRAService] Snapshot saved to scenario:', scenarioId);
  } catch (err) {
    console.error('[CRAService] Failed to save snapshot to Firestore:', err);
  }
}

export async function getCRASnapshotFromScenario(scenarioId) {
  if (!scenarioId) return null;
  try {
    const ref = doc(db, 'scenarios', scenarioId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data()?.cra_snapshot || null : null;
  } catch (err) {
    console.error('[CRAService] Failed to load snapshot:', err);
    return null;
  }
}

export async function getCRAFlags(scenarioId) {
  const snapshot = await getCRASnapshotFromScenario(scenarioId);
  return snapshot?.flags || null;
}

export async function getScenarioAMI(scenarioId) {
  const snapshot = await getCRASnapshotFromScenario(scenarioId);
  return snapshot?.incomeData || null;
}