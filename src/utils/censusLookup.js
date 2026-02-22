// src/utils/censusLookup.js
// FFIEC Census Tract Lookup — checks HomeReady/Home Possible eligibility
// Caches result in Firestore to avoid repeat API calls

import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Look up census tract data for a given address.
 * Returns tract info and HomeReady/HP eligibility.
 * Caches result in Firestore under censusCache/{cacheKey}
 */
export async function lookupCensusTract({ streetAddress, city, state, zipCode }) {
  if (!streetAddress || !city || !state || !zipCode) return null;

  const cacheKey = `${streetAddress}_${city}_${state}_${zipCode}`
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  // Check Firestore cache first
  try {
    const cacheRef = doc(db, 'censusCache', cacheKey);
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) {
      console.log('Census tract: cache hit');
      return cacheSnap.data();
    }
  } catch (e) {
    console.warn('Census cache read failed:', e);
  }

  // Call FFIEC geocoder API
  try {
    const encodedAddress = encodeURIComponent(`${streetAddress}, ${city}, ${state} ${zipCode}`);
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&vintage=Current_Current&layers=10&format=json`;

    const response = await fetch(url);
    const data = await response.json();

    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) {
      return { error: 'No census match found', eligible: null };
    }

    const match = matches[0];
    const tract = match.geographies?.['Census Tracts']?.[0];
    const blockGroup = match.geographies?.['Census Block Groups']?.[0];

    if (!tract) {
      return { error: 'Census tract not found', eligible: null };
    }

    const tractResult = {
      tractId: tract.GEOID,
      tractName: tract.NAME,
      state: tract.STATE,
      county: tract.COUNTY,
      tract: tract.TRACT,
      blockGroup: blockGroup?.BLKGRP || null,
      medianIncome: null, // placeholder — requires separate FFIEC call
      homeReadyEligible: null, // set below
      homePossibleEligible: null,
      lowIncomeArea: null,
      minorityArea: null,
      cachedAt: new Date().toISOString(),
    };

    // Determine eligibility based on tract characteristics
    // Note: Full AMI lookup requires FFIEC API — flagging for future enhancement
    tractResult.homeReadyEligible = 'check_required';
    tractResult.homePossibleEligible = 'check_required';

    // Cache in Firestore
    try {
      const cacheRef = doc(db, 'censusCache', cacheKey);
      await setDoc(cacheRef, tractResult);
    } catch (e) {
      console.warn('Census cache write failed:', e);
    }

    return tractResult;

  } catch (error) {
    console.error('Census lookup error:', error);
    return { error: error.message, eligible: null };
  }
}