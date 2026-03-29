/**
 * Map next-intl locale to Intl DateTimeFormat locale string.
 * Use this instead of hardcoded "en" or undefined in toLocaleDateString/toLocaleTimeString.
 */
export function getDateLocale(locale: string): string {
  return locale === "fr" ? "fr-FR" : "en-US";
}
