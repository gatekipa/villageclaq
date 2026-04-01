/**
 * Format phone number for WhatsApp Business API.
 * WhatsApp requires international format WITHOUT the + prefix:
 * - +237 677 123 456 → 237677123456
 * - +1 (240) 555-0123 → 12405550123
 * - 0677123456 (Cameroon) → 237677123456
 *
 * Returns null if the number is invalid.
 */

// Default country code when a local number (starting with 0) has no country code
const DEFAULT_COUNTRY_CODE = "237"; // Cameroon

// Common local-prefix → country-code mappings for African countries
const LOCAL_PREFIX_MAP: Record<string, string> = {
  "06": "237", // Cameroon
  "07": "237", // Cameroon
  "02": "237", // Cameroon
  "03": "237", // Cameroon
};

export function formatPhoneForWhatsApp(
  phone: string | null | undefined,
  countryCode?: string,
): string | null {
  if (!phone) return null;

  // Strip all non-digit characters except leading +
  let cleaned = phone.replace(/[\s\-()]/g, "");

  // If starts with +, remove it (WhatsApp API doesn't want the +)
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  // If starts with 00 (international prefix), strip it
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }

  // If starts with 0 (local format), prepend country code
  if (cleaned.startsWith("0")) {
    const prefix = cleaned.slice(0, 2);
    const cc = countryCode || LOCAL_PREFIX_MAP[prefix] || DEFAULT_COUNTRY_CODE;
    cleaned = cc + cleaned.slice(1);
  }

  // Strip any remaining non-digits
  cleaned = cleaned.replace(/\D/g, "");

  // Validate length (E.164: 7-15 digits)
  if (cleaned.length < 7 || cleaned.length > 15) {
    return null;
  }

  return cleaned;
}

/**
 * Validate that a phone number can be used with WhatsApp API.
 */
export function isValidWhatsAppNumber(phone: string | null | undefined): boolean {
  return formatPhoneForWhatsApp(phone) !== null;
}
