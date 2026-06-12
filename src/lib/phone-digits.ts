/**
 * Digits-only phone normalization for invitation matching.
 *
 * The matching rule is EXACT normalized digits (mirrored by
 * get_my_phone_digits() + the invitations phone policies in migration
 * 00095): strip every non-digit and compare the full strings. Suffix or
 * partial matching is deliberately NOT supported — profiles.phone is
 * self-asserted, and loose matching would let one account link itself to
 * another person's invitations.
 *
 * Known limitation (documented): an invitation saved in local format
 * ("0677123456") will not match an E.164 profile ("+237677123456") —
 * format divergence yields a false negative, never a false positive.
 */
export function phoneDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/** True when both values are present and their digit strings match exactly. */
export function phoneDigitsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  return !!da && !!db && da === db;
}
