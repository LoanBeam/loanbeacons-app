// src/utils/usdaLookup.js
export async function checkUsdaEligibility({ lat, lng }) {
  if (!lat || !lng) return { eligible: null, error: 'No coordinates' };
  try {
    const url = `https://services.arcgis.com/RHihShbyObN349B5/arcgis/rest/services/USDA_RD_Eligible_Areas/FeatureServer/0/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    console.log('USDA response:', data);
    const count = data?.count ?? data?.Count ?? 0;
    return { eligible: count > 0, error: null };
  } catch (err) {
    console.error('USDA check failed:', err.message);
    return { eligible: null, error: err.message };
  }
}
