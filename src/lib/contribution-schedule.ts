/**
 * Contribution due-date SCHEDULE ENGINE (Build 10).
 *
 * Single source of truth for *generating* a contribution obligation's due date
 * on the client enroll paths, and the shared date helpers the form preview uses.
 * It is PURE, deterministic, and timezone-safe (string YYYY-MM-DD math, never
 * timestamp arithmetic — so an admin in a negative-UTC diaspora timezone never
 * sees an off-by-one due date).
 *
 * NO schema change: this mirrors the existing obligation trigger
 * `generate_obligations_for_type()` (migration 00002, lines 107-118) byte-for-
 * byte for the cases the trigger handles, so a client-enrolled obligation gets
 * the SAME due_date the database trigger would generate:
 *   base := start_date (or today) ;  if due_day set → make_date(year,month,LEAST(due_day,28))
 * One-time contributions use `start_date` as their exact calendar due date (the
 * trigger already does this) — that is the "true one-time due date" with no new
 * column. `due_month` is intentionally NOT used here (the trigger ignores it),
 * to preserve enroll/trigger parity.
 */

export type ContributionFrequency = "one_time" | "monthly" | "quarterly" | "annual";

export interface ScheduleInput {
  frequency: ContributionFrequency | string;
  /** 1-31; clamped to LEAST(., 28) exactly like the trigger. */
  dueDay?: number | null;
  /** YYYY-MM-DD. One-time exact date / recurring anchor (the trigger's start_date). */
  startDate?: string | null;
  /** YYYY-MM-DD. Defaults to today (local). Injectable for deterministic tests. */
  baseDate?: string;
}

export interface ScheduleResult {
  /** YYYY-MM-DD — the obligation due_date, identical to the trigger's output. */
  dueISO: string;
  /** human period label (e.g. "June 2026", "Q2 2026", "2026", or the ISO date). */
  periodLabel: string;
  /** whole days from baseDate to dueISO (negative if already past). */
  daysUntil: number;
}

/** The obligation trigger clamps day 29-31 to 28 (month-end safe). Mirror it. */
export function clampDueDay(dueDay: number): number {
  return Math.min(28, Math.max(1, Math.round(dueDay)));
}

/** Local YYYY-MM-DD for "today" (timezone-safe — no UTC shift). */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a YYYY-MM-DD (or ISO timestamp) into {y, m (1-12), d}. */
export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}

/** Build a YYYY-MM-DD from year / 1-based month / day. */
export function isoFromParts(y: number, m1: number, d: number): string {
  return `${y}-${pad(m1)}-${pad(d)}`;
}

/** Whole days between two YYYY-MM-DD dates (b - a), timezone-safe via UTC noon. */
export function daysBetweenISO(aISO: string, bISO: string): number {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  const ta = Date.UTC(a.y, a.m - 1, a.d);
  const tb = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((tb - ta) / 86_400_000);
}

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Compute the obligation due date + period label exactly as the DB trigger would,
 * for a single obligation generated NOW (no forward rollover — matches the
 * trigger, which uses the base month). Used by the client enroll paths so they
 * agree with trigger-generated obligations.
 */
export function computeObligationDueDate(input: ScheduleInput): ScheduleResult {
  const base = (input.startDate && input.startDate.slice(0, 10)) || input.baseDate || todayISO();
  const { y, m } = parseISODate(base);

  let dueISO: string;
  if (input.dueDay != null && !Number.isNaN(Number(input.dueDay))) {
    dueISO = isoFromParts(y, m, clampDueDay(Number(input.dueDay)));
  } else {
    dueISO = base.slice(0, 10);
  }

  const due = parseISODate(dueISO);
  let periodLabel: string;
  switch (input.frequency) {
    case "monthly":
      periodLabel = `${MONTHS_EN[due.m - 1]} ${due.y}`;
      break;
    case "quarterly":
      periodLabel = `Q${Math.ceil(due.m / 3)} ${due.y}`;
      break;
    case "annual":
      periodLabel = String(due.y);
      break;
    case "one_time":
    default:
      periodLabel = dueISO;
      break;
  }

  return { dueISO, periodLabel, daysUntil: daysBetweenISO(input.baseDate || todayISO(), dueISO) };
}
