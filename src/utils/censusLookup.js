// src/utils/censusLookup.js - uses FCC API (CORS-friendly)
export async function lookupCensusTract({ lat, lng, streetAddress, city, state, zipCode }) {
  if (!lat || !lng) return { error: 'No coordinates available' };
  try {
    const url = `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lng}&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const block = data?.Block;
    const county = data?.County;
    const state2 = data?.State;
    if (!block?.FIPS) throw new Error('No census data returned');
    const fips = block.FIPS;
    return {
      tractId: fips.substring(0, 11),
      tract: fips.substring(5, 11),
      county: county?.name || '',
      state: state2?.code || '',
      blockGroup: fips.substring(11, 12) || null,
      lat, lng,
      cachedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Census lookup error:', err.message);
    return { error: err.message };
  }
}
