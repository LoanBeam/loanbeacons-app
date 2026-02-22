import { useEffect, useRef, useState } from 'react';
import { parseGooglePlace, validateAddressFields } from '../utils/addressValidation';

export default function AddressAutocomplete({ value, onAddressSelect }) {
  const inputRef = useRef(null);
  const [unit, setUnit] = useState(value?.unit || '');
  const [manualOverride, setManualOverride] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null);
  const [inputValue, setInputValue] = useState(value?.formattedAddress || value?.streetAddress || '');
  const [manualFields, setManualFields] = useState({
    streetAddress: value?.streetAddress || '',
    city: value?.city || '',
    state: value?.state || '',
    zipCode: value?.zipCode || '',
  });

  useEffect(() => {
    if (manualOverride) return;

    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

    const loadAutocomplete = async () => {
      if (!inputRef.current) return;

      if (!window.google?.maps) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[src*="maps.googleapis.com"]');
          if (existing) { resolve(); return; }
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
          script.async = true;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      let attempts = 0;
      while (!window.google?.maps?.places?.Autocomplete && attempts < 20) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }

      if (!window.google?.maps?.places?.Autocomplete) return;

      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'geometry', 'formatted_address', 'place_id'],
        types: ['address'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        const parsed = parseGooglePlace(place);
        const { valid } = validateAddressFields(parsed);
        setValidationStatus(valid ? 'valid' : 'invalid');
        setInputValue(place.formatted_address || '');
        onAddressSelect({ ...parsed, unit });
      });
    };

    loadAutocomplete();
  }, [manualOverride]);

  const handleUnitChange = (e) => {
    const newUnit = e.target.value;
    setUnit(newUnit);
    if (value) onAddressSelect({ ...value, unit: newUnit });
  };

  const handleManualChange = (field, val) => {
    const updated = { ...manualFields, [field]: val };
    setManualFields(updated);
    onAddressSelect({ ...updated, unit });
  };

  const handleToggleOverride = () => {
    setManualOverride(!manualOverride);
    setValidationStatus(null);
  };

  const borderClass = validationStatus === 'valid'
    ? 'border-green-400 bg-green-50'
    : validationStatus === 'invalid'
    ? 'border-yellow-400 bg-yellow-50'
    : 'border-gray-300';

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">
            Property Address
          </label>
          <button
            type="button"
            onClick={handleToggleOverride}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {manualOverride ? 'Use autocomplete' : 'Enter manually'}
          </button>
        </div>

        {manualOverride ? (
          <input
            type="text"
            value={manualFields.streetAddress}
            onChange={(e) => handleManualChange('streetAddress', e.target.value)}
            placeholder="e.g., 123 Main Street"
            className="w-full px-4 py-2 border border-yellow-400 rounded-lg bg-yellow-50"
          />
        ) : (
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g., 123 Main Street, Covington, GA"
              className={'w-full px-4 py-2 border rounded-lg ' + borderClass}
            />
            {validationStatus === 'valid' && (
              <span className="absolute right-3 top-2.5 text-green-500 text-lg">✓</span>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Unit / Apt / Suite <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={unit}
          onChange={handleUnitChange}
          placeholder="e.g., Apt 2B, Suite 100"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {manualOverride && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={manualFields.city}
              onChange={(e) => handleManualChange('city', e.target.value)}
              className="w-full px-4 py-2 border border-yellow-400 rounded-lg bg-yellow-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input
              type="text"
              value={manualFields.state}
              onChange={(e) => handleManualChange('state', e.target.value)}
              maxLength={2}
              className="w-full px-4 py-2 border border-yellow-400 rounded-lg bg-yellow-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
            <input
              type="text"
              value={manualFields.zipCode}
              onChange={(e) => handleManualChange('zipCode', e.target.value)}
              maxLength={5}
              className="w-full px-4 py-2 border border-yellow-400 rounded-lg bg-yellow-50"
            />
          </div>
        </div>
      )}

      {validationStatus === 'valid' && !manualOverride && (
        <p className="text-sm text-green-600">✓ Address verified by Google</p>
      )}
      {validationStatus === 'invalid' && !manualOverride && (
        <p className="text-sm text-yellow-600">⚠ Address may be incomplete</p>
      )}
      {manualOverride && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
          Manual entry mode - address will not be auto-validated
        </p>
      )}
    </div>
  );
}