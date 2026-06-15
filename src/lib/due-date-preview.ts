/**
 * Human due-date PREVIEW for contribution types (Build 9, extended Build 10).
 *
 * PURE + display-only. Describes a contribution type's schedule for the form/card
 * without changing any schema or obligation-generation behavior. The day-of-month
 * clamp is shared with the schedule engine (src/lib/contribution-schedule.ts) so
 * the preview never disagrees with generated obligations.
 *
 * Build 10: one-time contributions now have a TRUE calendar due date via the
 * existing `start_date` column — when provided, the preview shows that exact
 * date (kind "one_time"). Recurring monthly types keep the forward-looking
 * "next occurrence" preview. Quarterly/annual show a day-of-month label.
 */

// Self-contained (no module imports) so it stays directly unit-testable. The
// day clamp is intentionally identical to contribution-schedule.ts's clampDueDay;
// scripts/test-contribution-schedule.mjs pins the two equal so they never drift.

/** The obligation trigger clamps day 29-31 to 28 (month-end safe). Mirror it. */
export function clampDueDay(dueDay: number): number {
  return Math.min(28, Math.max(1, Math.round(dueDay)));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local YYYY-MM-DD for `now` (timezone-safe). */
function todayISO(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from aISO to bISO (b - a), timezone-safe via UTC. */
function daysBetweenISO(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.slice(0, 10).split("-").map((x) => parseInt(x, 10));
  const [by, bm, bd] = bISO.slice(0, 10).split("-").map((x) => parseInt(x, 10));
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export type DueDatePreview =
  | { kind: "none" }
  | {
      /** One-time contribution with an exact calendar due date (start_date). */
      kind: "one_time";
      dueISO: string;
      daysUntil: number;
    }
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

export function describeDueDay(opts: {
  dueDay: number | null | undefined;
  frequency: string;
  /** YYYY-MM-DD — one-time exact due date (start_date). */
  startDate?: string | null;
  now?: Date;
}): DueDatePreview {
  const { dueDay, frequency, startDate } = opts;
  const now = opts.now ?? new Date();

  // One-time: the exact calendar date (start_date) IS the due date. No date set
  // yet → "none" (the form prompts for it; it is required on submit).
  if (frequency === "one_time") {
    if (startDate) {
      const dueISO = startDate.slice(0, 10);
      return { kind: "one_time", dueISO, daysUntil: daysBetweenISO(todayISO(now), dueISO) };
    }
    return { kind: "none" };
  }

  if (dueDay == null || Number.isNaN(Number(dueDay))) {
    return { kind: "none" };
  }
  const clampedDay = clampDueDay(Number(dueDay));
  const period = frequency === "quarterly" ? "quarter" : frequency === "annual" ? "year" : "month";

  if (period !== "month") {
    return { kind: "recurring", clampedDay, period, nextDueISO: null, daysUntil: null };
  }

  // Monthly preview: forward-looking next occurrence (this month's clamped day if
  // still upcoming, else next month's). This is a recurring-schedule hint.
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
