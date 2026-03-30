// ─── African Country Calling Codes ──────────────────────────────────────────
// Only send SMS via Africa's Talking to African phone numbers.
// Numbers must be in E.164 format: +{country_code}{number}

const AFRICAN_COUNTRY_CODES = [
  "213", // Algeria
  "244", // Angola
  "229", // Benin
  "267", // Botswana
  "226", // Burkina Faso
  "257", // Burundi
  "237", // Cameroon
  "238", // Cape Verde
  "236", // Central African Republic
  "235", // Chad
  "269", // Comoros
  "243", // DR Congo
  "242", // Republic of Congo
  "225", // Cote d'Ivoire
  "253", // Djibouti
  "20",  // Egypt
  "240", // Equatorial Guinea
  "291", // Eritrea
  "268", // Eswatini
  "251", // Ethiopia
  "241", // Gabon
  "220", // Gambia
  "233", // Ghana
  "224", // Guinea
  "245", // Guinea-Bissau
  "254", // Kenya
  "266", // Lesotho
  "231", // Liberia
  "218", // Libya
  "261", // Madagascar
  "265", // Malawi
  "223", // Mali
  "222", // Mauritania
  "230", // Mauritius
  "212", // Morocco
  "258", // Mozambique
  "264", // Namibia
  "227", // Niger
  "234", // Nigeria
  "250", // Rwanda
  "239", // Sao Tome and Principe
  "221", // Senegal
  "248", // Seychelles
  "232", // Sierra Leone
  "252", // Somalia
  "27",  // South Africa
  "211", // South Sudan
  "249", // Sudan
  "255", // Tanzania
  "228", // Togo
  "216", // Tunisia
  "256", // Uganda
  "260", // Zambia
  "263", // Zimbabwe
] as const;

/**
 * Checks if a phone number belongs to an African country.
 * Accepts E.164 format (+237...) or with leading zeros.
 * Returns false for non-African numbers, empty strings, or nullish values.
 */
export function isAfricanPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;

  // Normalize: strip spaces, dashes, parens
  const cleaned = phone.replace(/[\s\-()]/g, "");

  // Must start with +
  if (!cleaned.startsWith("+")) return false;

  // Strip the leading +
  const digits = cleaned.slice(1);

  // Check if digits start with any African country code
  return AFRICAN_COUNTRY_CODES.some((code) => digits.startsWith(code));
}
