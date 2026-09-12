/**
 * Single trusted-drain date authority.
 * Calendar-day only. Never uses the host local timezone.
 * Date-only (YYYY-MM-DD) and date-time values resolve to the ISO date prefix
 * (or the UTC calendar day of a Date), then format with timeZone: "UTC".
 */

export type DrainDateLocale = "en" | "fr";
export type DrainDateStyle = "long" | "short" | "weekday";

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

export function trustedCalendarDay(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const match = ISO_DATE_PREFIX.exec(raw);
  if (!match) return null;
  const [year, month, day] = match[1].split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return match[1];
}

export function formatTrustedDrainDate(
  value: string | Date | null | undefined,
  locale: DrainDateLocale,
  style: DrainDateStyle = "long",
): string {
  const day = trustedCalendarDay(value);
  if (!day) return "";
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: style === "short" ? "short" : "long",
    day: "numeric",
    timeZone: "UTC",
  };
  if (style === "weekday") options.weekday = "long";
  return utc.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", options);
}

/** Calendar-day difference end − start, both UTC midnight. Never Date.now(). */
export function trustedCalendarDaysBetween(
  end: string | Date | null | undefined,
  start: string | Date | null | undefined,
): number | null {
  const endDay = trustedCalendarDay(end);
  const startDay = trustedCalendarDay(start);
  if (!endDay || !startDay) return null;
  const ms =
    Date.parse(`${endDay}T00:00:00.000Z`) - Date.parse(`${startDay}T00:00:00.000Z`);
  return Math.max(0, Math.round(ms / 86400000));
}
