/**
 * Exact decimal-string check for money entry (PRD N-007/F3-07: exact decimal
 * strings, no JS float as accounting authority). Mirrors the ledger's
 * financial_core.currency_scale / f3_amount contract: trailing zeros are
 * harmless ("5000.00" XAF is 5000), but significant digits beyond the
 * currency's precision are rejected rather than rounded.
 */
export type ExactAmountCheck = "OK" | "AMOUNT_NOT_POSITIVE" | "AMOUNT_PRECISION";

export function checkExactAmount(amount: string, decimals: number): ExactAmountCheck {
  const value = amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value) || /^0+(?:\.0+)?$/.test(value)) return "AMOUNT_NOT_POSITIVE";
  const significantFraction = (value.split(".")[1] ?? "").replace(/0+$/, "");
  return significantFraction.length > decimals ? "AMOUNT_PRECISION" : "OK";
}
