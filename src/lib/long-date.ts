/** Render a stored calendar date without converting it through the viewer's timezone. */
export function formatLongCalendarDate(key: string | Date, locale: string): string {
  const raw = key instanceof Date ? key.toISOString() : key;
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return raw;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}
