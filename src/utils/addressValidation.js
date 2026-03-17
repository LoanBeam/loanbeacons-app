const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const ENDPOINT = "https://addressvalidation.googleapis.com/v1:validateAddress";

export async function validateAddress({ address, city, state, zip }) {
  if (!address || !state) {
    return { status: "MISSING_INPUT", uspsAddress: null, verdict: null };
  }
  // Guard: if no API key configured, skip silently
  if (!API_KEY) {
    return { status: "API_ERROR", uspsAddress: null, verdict: null };
  }
  try {
    const response = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: {
          addressLines: [address],
          locality: city || "",
          administrativeArea: state,
          postalCode: zip || "",
        },
      }),
    });

    // Non-200: API key not enabled for Address Validation or quota exceeded
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errCode = errBody?.error?.status || '';
      // API not enabled — treat as soft skip rather than hard failure
      if (errCode === 'PERMISSION_DENIED' || errCode === 'API_KEY_INVALID' || response.status === 403) {
        return { status: "API_ERROR", uspsAddress: null, verdict: null };
      }
      return { status: "API_ERROR", uspsAddress: null, verdict: null };
    }

    const data = await response.json();
    const verdict  = data?.result?.verdict;
    const usps     = data?.result?.uspsData;
    const granularity = verdict?.validationGranularity || '';

    let status = "UNCONFIRMED";

    if (granularity === "PREMISE" || granularity === "SUB_PREMISE") {
      const components = data?.result?.address?.addressComponents || [];
      const suspicious = components.filter(
        c => c.confirmationLevel === "UNCONFIRMED_AND_SUSPICIOUS"
      );
      status = suspicious.length === 0 ? "CONFIRMED" : "PARTIAL";
    } else if (granularity === "ROUTE" || granularity === "BLOCK") {
      status = "PARTIAL";
    } else if (granularity === "PREMISE_PROXIMITY") {
      // Close enough — treat as partial
      status = "PARTIAL";
    } else {
      status = "FAILED";
    }

    // USPS delivery point check overrides if undeliverable
    const delivery = usps?.deliveryPointValidation;
    if (delivery === "MISSING" || delivery === "NO_STAT_PLUS") {
      status = "UNDELIVERABLE";
    }

    // If Google confirmed but USPS not available, keep CONFIRMED
    if (
      status === "FAILED" &&
      (verdict?.addressComplete === true || verdict?.hasInferredComponents === false)
    ) {
      status = "PARTIAL";
    }

    return {
      status,
      uspsAddress: usps?.standardizedAddress ? {
        line1: usps.standardizedAddress.firstAddressLine || "",
        city:  usps.standardizedAddress.city || "",
        state: usps.standardizedAddress.state || "",
        zip:   usps.standardizedAddress.zipCode || "",
        zip4:  usps.standardizedAddress.zipCodeExtension || "",
      } : null,
      verdict: {
        granularity: granularity || null,
        hasUnconfirmed: verdict?.hasUnconfirmedComponents || false,
        hasInferred:    verdict?.hasInferredComponents || false,
        addressComplete: verdict?.addressComplete || false,
        deliveryPoint:   delivery || null,
      },
      validatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[addressValidation] Error:", err);
    return { status: "API_ERROR", uspsAddress: null, verdict: null };
  }
}

export const VALIDATION_STATUS = {
  CONFIRMED: "CONFIRMED",
  PARTIAL: "PARTIAL",
  UNCONFIRMED: "UNCONFIRMED",
  UNDELIVERABLE: "UNDELIVERABLE",
  FAILED: "FAILED",
  MISSING_INPUT: "MISSING_INPUT",
  API_ERROR: "API_ERROR",
  PENDING: "PENDING",
};

export const validationDisplay = {
  CONFIRMED:     { label: "USPS Confirmed",    color: "#3fb950", bg: "#0f2913", border: "#1f6527", icon: "✅" },
  PARTIAL:       { label: "Partial Match",     color: "#fbbf24", bg: "#451a03", border: "#92400e", icon: "⚠️" },
  UNCONFIRMED:   { label: "Unconfirmed",       color: "#fbbf24", bg: "#451a03", border: "#92400e", icon: "⚠️" },
  UNDELIVERABLE: { label: "Undeliverable",     color: "#f85149", bg: "#280d0b", border: "#6e1b18", icon: "🚫" },
  FAILED:        { label: "Validation Failed", color: "#f85149", bg: "#280d0b", border: "#6e1b18", icon: "❌" },
  MISSING_INPUT: { label: "No Address",        color: "#8b949e", bg: "#161b22", border: "#21262d", icon: "—"  },
  API_ERROR:     { label: "API Error",         color: "#f85149", bg: "#280d0b", border: "#6e1b18", icon: "⚠️" },
  PENDING:       { label: "Validating…",       color: "#8b949e", bg: "#161b22", border: "#21262d", icon: "⏳" },
};

export function parseGooglePlace(place) {
  const components = place.addressComponents || place.address_components || [];
  const get = (type) => components.find((c) => (c.types || c.type || []).includes(type));
  const getShort = (type) => { const c = get(type); return c?.shortText || c?.short_name || ""; };
  const getLong  = (type) => { const c = get(type); return c?.longText  || c?.long_name  || ""; };
  const streetNumber = getShort("street_number");
  const route        = getShort("route");
  const city         = getLong("locality") || getLong("sublocality") || getLong("administrative_area_level_3");
  const state        = getShort("administrative_area_level_1") || "";
  const zipCode      = getShort("postal_code") || "";
  const county       = getLong("administrative_area_level_2") || "";
  const location     = place.location || place.geometry?.location;
  const lat          = typeof location?.lat === "function" ? location.lat() : location?.lat;
  const lng          = typeof location?.lng === "function" ? location.lng() : location?.lng;
  return {
    streetAddress: `${streetNumber} ${route}`.trim(),
    city, state, zipCode, county, lat, lng,
    placeId: place.id || place.place_id || null,
    formattedAddress: place.formattedAddress || place.formatted_address || "",
  };
}

export function validateAddressFields(address) {
  const errors = {};
  if (!address) return { isValid: false, errors: { address: "Address is required" } };
  if (!address.streetAddress) errors.streetAddress = "Street address is required";
  if (!address.city)          errors.city          = "City is required";
  if (!address.state)         errors.state         = "State is required";
  if (!address.zipCode)       errors.zipCode       = "ZIP code is required";
  return { isValid: Object.keys(errors).length === 0, errors };
}