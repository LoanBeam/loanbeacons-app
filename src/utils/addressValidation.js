// src/utils/addressValidation.js

export function addressesAreDifferent(addr1, addr2) {
  if (!addr1 || !addr2) return false;
  const normalize = (str) => (str || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const fields = ['streetAddress', 'city', 'state', 'zipCode'];
  return fields.some((field) => normalize(addr1[field]) !== normalize(addr2[field]));
}

export function parseGooglePlace(place) {
  // Handle both old API (address_components) and new API (addressComponents)
  const components = place.addressComponents || place.address_components || [];

  const get = (type) => components.find((c) => {
    const types = c.types || c.type || [];
    return Array.isArray(types) ? types.includes(type) : types === type;
  });

  const getShort = (type) => {
    const comp = get(type);
    return comp?.shortText || comp?.short_name || '';
  };

  const getLong = (type) => {
    const comp = get(type);
    return comp?.longText || comp?.long_name || '';
  };

  const streetNumber = getShort('street_number');
  const route = getShort('route');
  const city = getLong('locality') || getLong('sublocality') || getLong('administrative_area_level_3') || '';
  const state = getShort('administrative_area_level_1') || '';
  const zipCode = getShort('postal_code') || '';
  const county = getLong('administrative_area_level_2') || '';

  // Handle both old and new location formats
  const location = place.location || place.geometry?.location;
  const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat || null;
  const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng || null;

  return {
    streetAddress: `${streetNumber} ${route}`.trim(),
    city,
    state,
    zipCode,
    county,
    lat,
    lng,
    placeId: place.id || place.place_id || null,
    formattedAddress: place.formattedAddress || place.formatted_address || '',
  };
}

export function validateAddressFields(address) {
  const required = ['streetAddress', 'city', 'state', 'zipCode'];
  const missing = required.filter((f) => !address[f]);
  return { valid: missing.length === 0, missing };
}