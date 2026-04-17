/**
 * Shared formatting utilities for VillageClaq
 * Currency, dates, relative time — all locale-aware
 */

// ─── Currency ──────────────────────────────────────────────────────────────

const CURRENCY_MAP: Record<string, { locale: string; currency: string; decimals: number }> = {
  XAF: { locale: "fr-CM", currency: "XAF", decimals: 0 },
  XOF: { locale: "fr-SN", currency: "XOF", decimals: 0 },
  USD: { locale: "en-US", currency: "USD", decimals: 2 },
  EUR: { locale: "fr-FR", currency: "EUR", decimals: 2 },
  GBP: { locale: "en-GB", currency: "GBP", decimals: 2 },
  NGN: { locale: "en-NG", currency: "NGN", decimals: 2 },
  GHS: { locale: "en-GH", currency: "GHS", decimals: 2 },
  KES: { locale: "en-KE", currency: "KES", decimals: 2 },
  ZAR: { locale: "en-ZA", currency: "ZAR", decimals: 2 },
  CAD: { locale: "en-CA", currency: "CAD", decimals: 2 },
};

export function formatCurrency(amount: number, currencyCode = "XAF", userLocale = "en"): string {
  const config = CURRENCY_MAP[currencyCode] || { locale: "en-US", currency: currencyCode, decimals: 2 };
  const locale = userLocale === "fr" ? config.locale : config.locale.replace(/^fr/, "en");
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: config.currency,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString()}`;
  }
}

// ─── Dates ─────────────────────────────────────────────────────────────────

export function formatDate(date: string | Date, locale = "en", style: "short" | "long" | "medium" = "medium"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = style === "short"
    ? { month: "short", day: "numeric" }
    : style === "long"
    ? { year: "numeric", month: "long", day: "numeric", weekday: "long" }
    : { year: "numeric", month: "long", day: "numeric" };
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", options);
}

/**
 * Format a date using the group's saved `date_format` preference
 * (stored in groups.settings.date_format).
 *
 * Supported format strings (same values stored by the settings UI):
 *   "DD/MM/YYYY"   → 15/03/2026  (default; common in Africa + Europe)
 *   "MM/DD/YYYY"   → 03/15/2026  (US)
 *   "YYYY-MM-DD"   → 2026-03-15  (ISO 8601)
 *   "D MMMM YYYY"  → 15 March 2026 / 15 mars 2026
 *   "MMMM D, YYYY" → March 15, 2026 / 15 mars 2026
 *
 * Falls back to "DD/MM/YYYY" for unknown format strings.
 */
export function formatDateWithGroupFormat(
  date: string | Date,
  groupDateFormat = "DD/MM/YYYY",
  locale = "en",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  switch (groupDateFormat) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "D MMMM YYYY":
      return d.toLocaleDateString(intlLocale, { day: "numeric", month: "long", year: "numeric" });
    case "MMMM D, YYYY":
      return d.toLocaleDateString(intlLocale, { month: "long", day: "numeric", year: "numeric" });
    default:
      return `${day}/${month}/${year}`;
  }
}

export function formatTime(date: string | Date, locale = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  // EN → "3:00 PM" (hour: "numeric", 12-hour).
  // FR → "15:00" (hour: "2-digit", 24-hour).
  const options: Intl.DateTimeFormatOptions = locale === "fr"
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { hour: "numeric", minute: "2-digit", hour12: true };
  return d.toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", options);
}

export function formatDateTime(date: string | Date, locale = "en"): string {
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`;
}

/**
 * Event-style date+time for list rows, cards, and notifications.
 * EN: "Apr 17, 2026 at 3:00 PM"
 * FR: "17 avr. 2026 à 15:00"
 *
 * Uses getDateLocale() indirectly via formatTime. If the date is
 * invalid, returns the raw input string as a safe fallback.
 */
export function formatEventDateTime(date: string | Date, locale = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "";
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const dateStr = d.toLocaleDateString(intlLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = formatTime(d, locale);
  const connector = locale === "fr" ? " à " : " at ";
  return `${dateStr}${connector}${timeStr}`;
}

// ─── Relative Time ─────────────────────────────────────────────────────────

export function timeAgo(date: string | Date, locale = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (locale === "fr") {
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    if (hrs < 24) return `Il y a ${hrs}h`;
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days} jours`;
    return formatDate(d, "fr", "short");
  }

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(d, "en", "short");
}

// ─── Avatar Color ──────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-600",
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-lime-500 to-green-600",
];

export function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
