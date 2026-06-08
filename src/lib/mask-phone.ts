/**
 * Mask phone numbers before writing logs or audit output.
 * Keeps enough prefix/suffix to debug country/recipient matching without
 * exposing the full number.
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "(missing)";
  if (digits.length <= 6) return "***";

  const prefix = raw.startsWith("+") ? "+" : "";
  const visibleStart = digits.slice(0, Math.min(3, digits.length - 4));
  const visibleEnd = digits.slice(-3);

  return `${prefix}${visibleStart}******${visibleEnd}`;
}
