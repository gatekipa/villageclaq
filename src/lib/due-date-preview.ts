/**
 * Human due-date preview for contribution types (Build 9, WS2).
 *
 * PURE + display-only. This computes a friendly description of a contribution
 * type's due day WITHOUT changing any schema or obligation-generation behavior.
 * It mirrors the obligation trigger's `LEAST(due_day, 28)` clamp (migration
 * 00002) so the preview can never disagree with the dates the system actually
 * generates. `due_day` (1-31) remains the single stored mechanism.
 *
 * Monthly types get a precise next-due date + days-until. Quarterly/annual get a
 * day-of-month label only (the period anchoring isn't knowable client-side, so
 * we do not fabricate an exact date). One-time / no-due-day types return `none`.
 */

export type DueDatePreview =
  | { kind: "none" }
  | {
      kind: "recurring";
      /** day-of-month after the LEAST(day,28) clamp the trigger applies */
      clampedDay: number;
      period: "month" | "quarter" | "year";
      /** ISO yyyy-mm-dd of the next monthly occurrence, or null for quarter/year */
      nextDueISO: string | null;
      /** whole days from today to nextDueISO, or null when nextDueISO is null */
      daysUntil: number | null;
    };

/** The obligation trigger clamps day 29-31 to 28 (month-end safe). Mirror it. */
export function clampDueDay(dueDay: number): number {
  return Math.min(28, Math.max(1, Math.round(dueDay)));
}

export function describeDueDay(opts: {
  dueDay: number | null | undefined;
  frequency: string;
  now?: Date;
}): DueDatePreview {
  const { dueDay, frequency } = opts;
  const now = opts.now ?? new Date();
  if (dueDay == null || Number.isNaN(Number(dueDay)) || frequency === "one_time") {
    return { kind: "none" };
  }
  const clampedDay = clampDueDay(Number(dueDay));
  const period = frequency === "quarterly" ? "quarter" : frequency === "annual" ? "year" : "month";

  if (period !== "month") {
    return { kind: "recurring", clampedDay, period, nextDueISO: null, daysUntil: null };
  }

  // Monthly: this month's clamped day if still upcoming, else next month's.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), now.getMonth(), clampedDay);
  if (next.getTime() < today.getTime()) {
    next = new Date(now.getFullYear(), now.getMonth() + 1, clampedDay);
  }
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  const nextDueISO = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return { kind: "recurring", clampedDay, period: "month", nextDueISO, daysUntil };
}

/** Localized ordinal day-of-month, e.g. "15th" (en) / "15" or "1er" (fr). */
export function ordinalDay(day: number, locale: string): string {
  if (locale === "fr") return day === 1 ? "1er" : String(day);
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}
