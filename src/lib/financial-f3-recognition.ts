/**
 * F3 cash-basis recognition gate (frozen contract).
 * No UI. No enqueue. No producer wiring. Command-path documentation only.
 *
 * Never treat the following as Statement-of-Activities income:
 * pending / rejected / voided / relief-misapplied / dues assessment /
 * opening arrears / refundable deposit / Njangi contribution / unconfirmed.
 */

export const F3_CONTRACT_VERSION = "f3-posting-v1" as const;

export const F3_NON_INCOME_STATES = [
  "pending",
  "rejected",
  "voided",
  "relief_misapplied",
  "dues_assessment",
  "opening_arrears",
  "refundable_deposit",
  "njangi_contribution",
  "unconfirmed",
] as const;

export function isRecognizedSoaIncome(kind: string): boolean {
  return !F3_NON_INCOME_STATES.includes(kind as (typeof F3_NON_INCOME_STATES)[number]);
}
