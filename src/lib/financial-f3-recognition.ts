/**
 * F3 cash-basis recognition gate (frozen contract).
 * No UI. No enqueue. No producer wiring. Command-path documentation only.
 *
 * F2 cash-basis: Statement-of-Activities income is recognized only for an
 * established posted operating-income effect. Unknown, future, empty, and
 * malformed kinds fail closed (not income). This is an exhaustive typed
 * EXACT allowlist — never a denylist with default-to-income.
 *
 * F3-02 oracle + 00120 posting command mapping (frozen authority):
 *   money_in            → effect_kind `manual_income`      → operating_income
 *   money_out           → effect_kind `manual_expense`     → NOT income
 *   transfer            → effect_kind `account_transfer`   → NOT income
 *   opening             → effect_kind `opening_custody`    → NOT income
 *   correction_reversal → not an F3-02 income effect_kind  → NOT income
 *
 * Allowlist is EXACTLY `manual_income`. Do not invent dues / fine / interest /
 * relief module kinds; those are not F3-02 effect_kinds.
 */

export const F3_CONTRACT_VERSION = "f3-posting-v1" as const;

export const F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS = ["manual_income"] as const;

export type F3RecognizedSoaIncomeEffectKind =
  (typeof F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS)[number];

export function isRecognizedSoaIncome(kind: string): boolean {
  if (typeof kind !== "string") return false;
  // Exact match only. Trim is used solely to reject empty/whitespace; it is
  // never used to fuzzy-normalize a kind onto the allowlist.
  if (kind.trim() === "") return false;
  return (F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS as readonly string[]).includes(kind);
}
