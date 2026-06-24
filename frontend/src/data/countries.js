// ─────────────────────────────────────────────────────────────────────────────
// Supported countries for account opening + per-country KYC document rules.
//
// Each country lists the documents its banks actually require to open an
// individual account. Selecting a country in the onboarding wizard drives:
//   • which document upload tiles / ID-number fields are shown (StepDocuments)
//   • which uploads + ID numbers are mandatory to advance (getStepErrors)
//   • the phone / postal-code validation applied (country-aware)
//
// Sources (rephrased for compliance):
//   Nepal      – Rastriya Banijya Bank, Global IME Bank, Kumari Bank KYC pages
//   Bhutan     – Bank of Bhutan online account opening
//   Bangladesh – Eastern Bank (EBL Insta), Dutch-Bangla agent banking
//   India      – existing Aadhaar/PAN-centric KYC
// ─────────────────────────────────────────────────────────────────────────────

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^\d{12}$/;

/**
 * The four supported nations. `nationality` auto-fills the personal step,
 * `phoneDigits`/`postalDigits` drive country-aware validation, and `postalLabel`
 * renames the PIN/postal field appropriately.
 */
export const COUNTRIES = [
  { code: 'IN', name: 'India',      flag: '🇮🇳', dialCode: '+91',  nationality: 'Indian',      phoneDigits: 10, phoneHint: '10-digit mobile number', postalLabel: 'PIN Code',     postalDigits: 6, hasStateList: true },
  { code: 'NP', name: 'Nepal',      flag: '🇳🇵', dialCode: '+977', nationality: 'Nepali',      phoneDigits: 10, phoneHint: '10-digit mobile number', postalLabel: 'Postal Code',  postalDigits: 5, hasStateList: false },
  { code: 'BT', name: 'Bhutan',     flag: '🇧🇹', dialCode: '+975', nationality: 'Bhutanese',   phoneDigits: 8,  phoneHint: '8-digit mobile number',  postalLabel: 'Postal Code',  postalDigits: 5, hasStateList: false },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', dialCode: '+880', nationality: 'Bangladeshi', phoneDigits: 11, phoneHint: '11-digit mobile number', postalLabel: 'Postal Code',  postalDigits: 4, hasStateList: false },
];

export const DEFAULT_COUNTRY = 'India';

/**
 * Per-country document requirements. Each entry:
 *   key         – form.files key + multer field name + file document identifier
 *   idKey       – form field holding the document NUMBER (null → upload only)
 *   label       – display label
 *   placeholder – ID input placeholder (null when there's no ID field)
 *   required    – must be supplied before the user can advance
 *   format      – optional input mask hint ('aadhaar' | 'pan')
 *   validate    – optional (value) => errorMessage | null for the ID field
 */
export const COUNTRY_DOCUMENTS = {
  India: [
    { key: 'aadhaar', idKey: 'aadhaarNumber', label: 'Aadhaar Card', placeholder: '1234 5678 9012', required: true, format: 'aadhaar',
      validate: (v) => !v ? 'Aadhaar number is required.' : !AADHAAR_RE.test(v) ? 'Aadhaar must be exactly 12 digits.' : null },
    { key: 'pan', idKey: 'panNumber', label: 'PAN Card', placeholder: 'ABCDE1234F', required: true, format: 'pan',
      validate: (v) => !v ? 'PAN number is required.' : !PAN_RE.test(v) ? 'Enter a valid PAN (e.g. ABCDE1234F).' : null },
    { key: 'passport', idKey: 'passportNumber', label: 'Passport', placeholder: 'A1234567', required: false },
    { key: 'selfie', idKey: null, label: 'Live Selfie / Photograph', placeholder: null, required: true },
    { key: 'signature', idKey: null, label: 'Signature', placeholder: null, required: true },
    { key: 'address_proof', idKey: null, label: 'Address Proof', placeholder: null, required: true },
  ],
  Nepal: [
    { key: 'citizenship', idKey: 'citizenshipNumber', label: 'Citizenship Certificate (Nagarikta)', placeholder: 'Citizenship No.', required: true },
    { key: 'selfie', idKey: null, label: 'Passport-size Photograph', placeholder: null, required: true },
    { key: 'signature', idKey: null, label: 'Signature Specimen', placeholder: null, required: true },
    { key: 'address_proof', idKey: null, label: 'Address Proof (Utility Bill)', placeholder: null, required: true },
    { key: 'passport', idKey: 'passportNumber', label: 'Passport (for NRN / foreign nationals)', placeholder: 'Passport No.', required: false },
  ],
  Bhutan: [
    { key: 'cid', idKey: 'cidNumber', label: 'Citizenship Identity Card (CID)', placeholder: 'CID No.', required: true },
    { key: 'selfie', idKey: null, label: 'Passport-size Photograph', placeholder: null, required: true },
    { key: 'signature', idKey: null, label: 'Signature Specimen', placeholder: null, required: true },
    { key: 'address_proof', idKey: null, label: 'Address Proof', placeholder: null, required: true },
  ],
  Bangladesh: [
    { key: 'nid', idKey: 'nidNumber', label: 'National ID Card (NID)', placeholder: 'NID No.', required: true },
    { key: 'selfie', idKey: null, label: 'Live Photograph / Selfie', placeholder: null, required: true },
    { key: 'signature', idKey: null, label: 'Signature Specimen', placeholder: null, required: true },
    { key: 'address_proof', idKey: null, label: 'Address Proof (Utility Bill)', placeholder: null, required: true },
    { key: 'nominee_nid', idKey: null, label: 'Nominee NID', placeholder: null, required: false },
    { key: 'tin', idKey: 'tinNumber', label: 'TIN Certificate', placeholder: 'TIN No.', required: false },
  ],
};

/** Every identity-number field key across all countries (used to reset state). */
export const ALL_ID_KEYS = [
  'aadhaarNumber', 'panNumber', 'passportNumber',
  'citizenshipNumber', 'cidNumber', 'nidNumber', 'tinNumber',
];

/** Resolve a country config by name, defaulting to India. */
export const getCountry = (name) =>
  COUNTRIES.find((c) => c.name === name) || COUNTRIES[0];

/** Resolve a country's document list by name, defaulting to India. */
export const getCountryDocuments = (name) =>
  COUNTRY_DOCUMENTS[name] || COUNTRY_DOCUMENTS[DEFAULT_COUNTRY];

/**
 * Validate the Documents step for the selected country. Returns a map of
 * { fieldKey: 'message' } (empty = valid). ID errors are keyed by their idKey;
 * missing uploads are keyed as `file_<docKey>`.
 */
export const validateCountryDocuments = (countryName, form) => {
  const errors = {};
  getCountryDocuments(countryName).forEach((doc) => {
    const value = doc.idKey ? (form[doc.idKey] || '') : '';

    if (doc.idKey) {
      if (doc.validate) {
        const msg = doc.validate(value);
        if (msg) errors[doc.idKey] = msg;
      } else if (doc.required && !value.trim()) {
        errors[doc.idKey] = `${doc.label} number is required.`;
      }
    }

    if (doc.required && !form.files?.[doc.key]) {
      errors[`file_${doc.key}`] = `${doc.label} upload is required.`;
    }
  });
  return errors;
};
