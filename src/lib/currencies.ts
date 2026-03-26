export interface CurrencyDef {
  code: string;
  symbol: string;
  name: string;
  nameFr: string;
  decimals: number; // 0 for CFA francs, 2 for most others
}

export const CURRENCIES: CurrencyDef[] = [
  // African currencies
  { code: "XAF", symbol: "FCFA", name: "Central African CFA Franc", nameFr: "Franc CFA d'Afrique centrale", decimals: 0 },
  { code: "XOF", symbol: "FCFA", name: "West African CFA Franc", nameFr: "Franc CFA d'Afrique de l'Ouest", decimals: 0 },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", nameFr: "Naira nigérian", decimals: 2 },
  { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi", nameFr: "Cédi ghanéen", decimals: 2 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", nameFr: "Shilling kényan", decimals: 2 },
  { code: "ZAR", symbol: "R", name: "South African Rand", nameFr: "Rand sud-africain", decimals: 2 },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr", nameFr: "Birr éthiopien", decimals: 2 },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling", nameFr: "Shilling tanzanien", decimals: 0 },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling", nameFr: "Shilling ougandais", decimals: 0 },
  { code: "RWF", symbol: "RF", name: "Rwandan Franc", nameFr: "Franc rwandais", decimals: 0 },
  { code: "CDF", symbol: "FC", name: "Congolese Franc", nameFr: "Franc congolais", decimals: 2 },
  // International currencies
  { code: "USD", symbol: "$", name: "US Dollar", nameFr: "Dollar américain", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", nameFr: "Euro", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", nameFr: "Livre sterling", decimals: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", nameFr: "Dollar canadien", decimals: 2 },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", nameFr: "Franc suisse", decimals: 2 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", nameFr: "Dollar australien", decimals: 2 },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", nameFr: "Dirham des EAU", decimals: 2 },
];

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol || code;
}

export function getCurrencyDef(code: string): CurrencyDef | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

/**
 * Format an amount with the correct currency symbol and locale-aware separators.
 * CFA francs: no decimals, space as thousands separator → "FCFA 15 000"
 * USD/EUR/GBP: 2 decimals → "$15,000.00"
 */
export function formatAmount(amount: number | string | null | undefined, currencyCode: string): string {
  const num = Number(amount) || 0;
  const def = getCurrencyDef(currencyCode);
  const symbol = def?.symbol || currencyCode;
  const decimals = def?.decimals ?? 2;

  // Use Intl.NumberFormat for proper locale-aware formatting
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);

    // For CFA francs, put symbol after: "15,000 FCFA"
    if (currencyCode === "XAF" || currencyCode === "XOF") {
      return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
  } catch {
    return `${symbol}${num.toFixed(decimals)}`;
  }
}

/**
 * Get a compact format for stat cards: "15K" or "1.2M"
 */
export function formatAmountCompact(amount: number | string | null | undefined, currencyCode: string): string {
  const num = Number(amount) || 0;
  const symbol = getCurrencySymbol(currencyCode);

  if (num >= 1_000_000) {
    const m = (num / 1_000_000).toFixed(1);
    return currencyCode === "XAF" || currencyCode === "XOF"
      ? `${m}M ${symbol}`
      : `${symbol}${m}M`;
  }
  if (num >= 1_000) {
    const k = (num / 1_000).toFixed(0);
    return currencyCode === "XAF" || currencyCode === "XOF"
      ? `${k}K ${symbol}`
      : `${symbol}${k}K`;
  }
  return formatAmount(num, currencyCode);
}
