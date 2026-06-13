/**
 * Standing rules — the configurable model that decides what affects a
 * member's good standing, per group.
 *
 * Stored in groups.settings.standing_rules (JSONB, snake_case keys) so a
 * group can be configured WITHOUT a schema migration. Migration 00080
 * already persists the thresholds + an `enabled` opt-out and reads them in
 * the SQL standing functions; this module adds the per-FACTOR on/off model
 * and a per-contribution-type exclusion list on top of the same JSONB.
 *
 * Two engines must agree on this shape:
 *  - the TypeScript engine (calculate-standing.ts) — honored immediately.
 *  - the SQL engine (compute_member_standing) — honored once migration
 *    00101 is applied (created in this sprint, NOT applied).
 *
 * Design principle (Sprint D): a random contribution, fine, loan, event,
 * or activity must NOT automatically damage good standing unless the group
 * (factor toggle) or the item (exclusion list) marks it as standing-
 * impacting. Hence fines and loans default OFF — they are separate debts,
 * and this also matches the SQL engine, which never counted them.
 */

export type StandingFactorKey =
  | "dues"
  | "attendance"
  | "relief"
  | "hosting"
  | "fines"
  | "loans"
  | "disputes";

/** Stable display/order list of every configurable factor. */
export const STANDING_FACTOR_KEYS: StandingFactorKey[] = [
  "dues",
  "attendance",
  "relief",
  "hosting",
  "fines",
  "loans",
  "disputes",
];

export type StandingFactors = Record<StandingFactorKey, boolean>;

/**
 * Safe, honest defaults. Core obligations (dues, attendance, relief,
 * hosting) and open disputes affect standing out of the box — matching the
 * long-standing product behaviour. Fines and loans are OFF by default:
 * they are separate liabilities a group opts into, and leaving them off
 * keeps the TS and SQL engines in agreement until a group decides
 * otherwise.
 */
export const DEFAULT_STANDING_FACTORS: StandingFactors = {
  dues: true,
  attendance: true,
  relief: true,
  hosting: true,
  fines: false,
  loans: false,
  disputes: true,
};

export interface StandingRules {
  /** Master switch — when false, auto-standing is off and the stored value is kept. */
  enabled: boolean;
  attendanceThresholdPercent: number;
  missedHostingThreshold: number;
  overdueGraceDays: number;
  attendanceLookbackMonths: number;
  /** Which factors are allowed to affect standing. */
  factors: StandingFactors;
  /**
   * Contribution-type ids whose obligations do NOT affect standing even
   * when the `dues` factor is on (e.g. a one-off voluntary levy). Per-item
   * control without a schema migration — stored in the same JSONB.
   */
  excludedContributionTypeIds: string[];
}

export const DEFAULT_STANDING_RULES: StandingRules = {
  enabled: true,
  attendanceThresholdPercent: 60,
  missedHostingThreshold: 2,
  overdueGraceDays: 0,
  attendanceLookbackMonths: 12,
  factors: { ...DEFAULT_STANDING_FACTORS },
  excludedContributionTypeIds: [],
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/**
 * Read the raw groups.settings JSONB and return a fully-resolved,
 * defaulted, clamped StandingRules. Accepts either the stored snake_case
 * shape (migration 00080 + this sprint) and never throws on malformed input
 * — unknown/missing keys fall back to the safe defaults.
 */
export function resolveStandingRules(groupSettings: unknown): StandingRules {
  const settings = (groupSettings ?? {}) as Record<string, unknown>;
  const raw = (settings.standing_rules ?? {}) as Record<string, unknown>;

  const rawFactors = (raw.factors ?? {}) as Record<string, unknown>;
  const factors = {} as StandingFactors;
  for (const key of STANDING_FACTOR_KEYS) {
    factors[key] = coerceBool(rawFactors[key], DEFAULT_STANDING_FACTORS[key]);
  }

  const rawExcluded = raw.excluded_contribution_type_ids;
  const excludedContributionTypeIds = Array.isArray(rawExcluded)
    ? rawExcluded.filter((v): v is string => typeof v === "string")
    : [];

  return {
    enabled: coerceBool(raw.enabled, DEFAULT_STANDING_RULES.enabled),
    attendanceThresholdPercent: clampInt(raw.attendance_threshold_percent, 0, 100, 60),
    missedHostingThreshold: clampInt(raw.missed_hosting_threshold, 0, 50, 2),
    overdueGraceDays: clampInt(raw.overdue_grace_days, 0, 365, 0),
    attendanceLookbackMonths: clampInt(raw.attendance_lookback_months, 1, 60, 12),
    factors,
    excludedContributionTypeIds,
  };
}

/**
 * Serialize a StandingRules back to the JSONB snake_case shape stored in
 * groups.settings.standing_rules. Kept in one place so the settings UI and
 * any writer agree with what resolveStandingRules() reads.
 */
export function serializeStandingRules(rules: StandingRules): Record<string, unknown> {
  return {
    enabled: rules.enabled,
    attendance_threshold_percent: rules.attendanceThresholdPercent,
    missed_hosting_threshold: rules.missedHostingThreshold,
    overdue_grace_days: rules.overdueGraceDays,
    attendance_lookback_months: rules.attendanceLookbackMonths,
    factors: { ...rules.factors },
    excluded_contribution_type_ids: [...rules.excludedContributionTypeIds],
  };
}
