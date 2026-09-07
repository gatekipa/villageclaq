import { formatAmount } from "./currencies.ts";

export interface CurrencyAmountBucket {
  currency: string;
  amount: number;
}

function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCurrency(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

/** Sum native amounts by ISO currency. Unlike currencies are never converted. */
export function bucketCurrencyAmounts<T>(
  rows: readonly T[],
  amountOf: (row: T) => number,
  currencyOf: (row: T) => string | null | undefined,
): CurrencyAmountBucket[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const amount = roundAmount(amountOf(row));
    const currency = normalizeCurrency(currencyOf(row));
    if (!currency) {
      if (amount !== 0) throw new Error("FINANCIAL_CURRENCY_REQUIRED");
      continue;
    }
    totals.set(currency, roundAmount((totals.get(currency) || 0) + amount));
  }

  return [...totals.entries()]
    .filter(([, amount]) => amount !== 0 || totals.size === 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }));
}

export function formatCurrencyBuckets(
  buckets: readonly CurrencyAmountBucket[],
): string[] {
  return buckets.map(({ currency, amount }) => formatAmount(amount, currency));
}

export function currencyBucketsToRecord(
  buckets: readonly CurrencyAmountBucket[],
): Record<string, number> {
  return Object.fromEntries(buckets.map(({ currency, amount }) => [currency, amount]));
}
