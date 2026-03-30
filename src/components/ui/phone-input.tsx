"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountryDef {
  code: string;
  country: string;
  label: string;
  flag: string;
  digits: number;
  placeholder: string;
  groups: number[];
  priority?: boolean;
}

// Priority countries shown first, separated by a divider
const COUNTRY_CODES: CountryDef[] = [
  // ── Priority countries ──
  { code: "+237", country: "CM", label: "Cameroon", flag: "🇨🇲", digits: 9, placeholder: "6 77 12 34 56", groups: [1, 2, 2, 2, 2], priority: true },
  { code: "+234", country: "NG", label: "Nigeria", flag: "🇳🇬", digits: 10, placeholder: "801 234 5678", groups: [3, 3, 4], priority: true },
  { code: "+1", country: "US", label: "United States", flag: "🇺🇸", digits: 10, placeholder: "(240) 555-0123", groups: [3, 3, 4], priority: true },
  { code: "+44", country: "GB", label: "United Kingdom", flag: "🇬🇧", digits: 10, placeholder: "7911 123 456", groups: [4, 3, 3], priority: true },
  { code: "+33", country: "FR", label: "France", flag: "🇫🇷", digits: 9, placeholder: "6 12 34 56 78", groups: [1, 2, 2, 2, 2], priority: true },
  { code: "+49", country: "DE", label: "Germany", flag: "🇩🇪", digits: 10, placeholder: "170 123 4567", groups: [3, 3, 4], priority: true },
  { code: "+1", country: "CA", label: "Canada", flag: "🇨🇦", digits: 10, placeholder: "(416) 555-0123", groups: [3, 3, 4], priority: true },

  // ── African countries ──
  { code: "+233", country: "GH", label: "Ghana", flag: "🇬🇭", digits: 9, placeholder: "24 123 4567", groups: [2, 3, 4] },
  { code: "+254", country: "KE", label: "Kenya", flag: "🇰🇪", digits: 9, placeholder: "712 345 678", groups: [3, 3, 3] },
  { code: "+27", country: "ZA", label: "South Africa", flag: "🇿🇦", digits: 9, placeholder: "71 123 4567", groups: [2, 3, 4] },
  { code: "+221", country: "SN", label: "Senegal", flag: "🇸🇳", digits: 9, placeholder: "77 123 45 67", groups: [2, 3, 2, 2] },
  { code: "+225", country: "CI", label: "Côte d'Ivoire", flag: "🇨🇮", digits: 10, placeholder: "07 12 34 56 78", groups: [2, 2, 2, 2, 2] },
  { code: "+243", country: "CD", label: "DR Congo", flag: "🇨🇩", digits: 9, placeholder: "81 234 5678", groups: [2, 3, 4] },
  { code: "+251", country: "ET", label: "Ethiopia", flag: "🇪🇹", digits: 9, placeholder: "91 234 5678", groups: [2, 3, 4] },
  { code: "+255", country: "TZ", label: "Tanzania", flag: "🇹🇿", digits: 9, placeholder: "71 234 5678", groups: [2, 3, 4] },
  { code: "+256", country: "UG", label: "Uganda", flag: "🇺🇬", digits: 9, placeholder: "77 123 4567", groups: [2, 3, 4] },
  { code: "+250", country: "RW", label: "Rwanda", flag: "🇷🇼", digits: 9, placeholder: "78 123 4567", groups: [2, 3, 4] },
  { code: "+241", country: "GA", label: "Gabon", flag: "🇬🇦", digits: 8, placeholder: "06 12 34 56", groups: [2, 2, 2, 2] },
  { code: "+229", country: "BJ", label: "Benin", flag: "🇧🇯", digits: 8, placeholder: "97 12 34 56", groups: [2, 2, 2, 2] },
  { code: "+228", country: "TG", label: "Togo", flag: "🇹🇬", digits: 8, placeholder: "90 12 34 56", groups: [2, 2, 2, 2] },
  { code: "+223", country: "ML", label: "Mali", flag: "🇲🇱", digits: 8, placeholder: "70 12 34 56", groups: [2, 2, 2, 2] },
  { code: "+226", country: "BF", label: "Burkina Faso", flag: "🇧🇫", digits: 8, placeholder: "70 12 34 56", groups: [2, 2, 2, 2] },
  { code: "+227", country: "NE", label: "Niger", flag: "🇳🇪", digits: 8, placeholder: "90 12 34 56", groups: [2, 2, 2, 2] },
  { code: "+224", country: "GN", label: "Guinea", flag: "🇬🇳", digits: 9, placeholder: "621 12 34 56", groups: [3, 2, 2, 2] },

  // ── Diaspora destinations ──
  { code: "+32", country: "BE", label: "Belgium", flag: "🇧🇪", digits: 9, placeholder: "470 12 34 56", groups: [3, 2, 2, 2] },
  { code: "+39", country: "IT", label: "Italy", flag: "🇮🇹", digits: 10, placeholder: "312 345 6789", groups: [3, 3, 4] },
  { code: "+34", country: "ES", label: "Spain", flag: "🇪🇸", digits: 9, placeholder: "612 34 56 78", groups: [3, 2, 2, 2] },
  { code: "+31", country: "NL", label: "Netherlands", flag: "🇳🇱", digits: 9, placeholder: "6 1234 5678", groups: [1, 4, 4] },
  { code: "+41", country: "CH", label: "Switzerland", flag: "🇨🇭", digits: 9, placeholder: "76 123 45 67", groups: [2, 3, 2, 2] },
  { code: "+61", country: "AU", label: "Australia", flag: "🇦🇺", digits: 9, placeholder: "412 345 678", groups: [3, 3, 3] },
  { code: "+971", country: "AE", label: "UAE", flag: "🇦🇪", digits: 9, placeholder: "50 123 4567", groups: [2, 3, 4] },
  { code: "+966", country: "SA", label: "Saudi Arabia", flag: "🇸🇦", digits: 9, placeholder: "50 123 4567", groups: [2, 3, 4] },
  { code: "+86", country: "CN", label: "China", flag: "🇨🇳", digits: 11, placeholder: "138 1234 5678", groups: [3, 4, 4] },
];

const CURRENCY_TO_CODE: Record<string, string> = {
  XAF: "+237", XOF: "+221", NGN: "+234", GHS: "+233", KES: "+254",
  ZAR: "+27", USD: "+1", GBP: "+44", EUR: "+33", CAD: "+1", CHF: "+41",
  CDF: "+243", ETB: "+251", TZS: "+255", UGX: "+256", RWF: "+250",
};

export function getDefaultCountryCode(currency?: string | null): string {
  if (currency && CURRENCY_TO_CODE[currency]) return CURRENCY_TO_CODE[currency];
  return "+237";
}

/** Format digits into groups with spaces (or US/CA format with parens/dash) */
function formatDigits(digits: string, country: CountryDef): string {
  if (!digits) return "";

  // Special US/Canada formatting: (240) 555-0123
  if (country.code === "+1" && digits.length >= 1) {
    const area = digits.slice(0, 3);
    const mid = digits.slice(3, 6);
    const last = digits.slice(6, 10);
    if (digits.length <= 3) return `(${area}`;
    if (digits.length <= 6) return `(${area}) ${mid}`;
    return `(${area}) ${mid}-${last}`;
  }

  // General formatting: apply group sizes
  let result = "";
  let pos = 0;
  for (const size of country.groups) {
    if (pos >= digits.length) break;
    if (pos > 0) result += " ";
    result += digits.slice(pos, pos + size);
    pos += size;
  }
  if (pos < digits.length) {
    result += " " + digits.slice(pos);
  }
  return result;
}

export interface PhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  defaultCountryCode?: string;
  disabled?: boolean;
}

export function PhoneInput({ value, onChange, defaultCountryCode = "+237", disabled = false }: PhoneInputProps) {
  const parsePhone = useCallback((phone: string) => {
    if (!phone) return { code: defaultCountryCode, number: "" };
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const cc of sorted) {
      if (phone.startsWith(cc.code)) {
        return { code: cc.code, number: phone.slice(cc.code.length) };
      }
    }
    return { code: defaultCountryCode, number: phone.replace(/^\+\d+/, "") };
  }, [defaultCountryCode]);

  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = useState(parsed.code);
  const [rawDigits, setRawDigits] = useState(parsed.number);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value && defaultCountryCode) setCountryCode(defaultCountryCode);
  }, [defaultCountryCode, value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [dropdownOpen]);

  const currentCountry = useMemo(
    () => COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0],
    [countryCode]
  );

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return COUNTRY_CODES;
    const q = search.toLowerCase().trim();
    return COUNTRY_CODES.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.country.toLowerCase().includes(q)
    );
  }, [search]);

  const priorityCountries = filteredCountries.filter((c) => c.priority);
  const otherCountries = filteredCountries.filter((c) => !c.priority);

  const digitCount = rawDigits.length;
  const expectedDigits = currentCountry.digits;
  const isComplete = digitCount === expectedDigits;
  const isOverflow = digitCount > expectedDigits;
  const isEmpty = digitCount === 0;
  const isValid = isEmpty || isComplete;

  const handleCodeChange = (cc: CountryDef) => {
    setCountryCode(cc.code);
    setRawDigits("");
    onChange("");
    setDropdownOpen(false);
    setSearch("");
  };

  const handleNumberChange = (input: string) => {
    const cleaned = input.replace(/[^\d]/g, "");
    const capped = cleaned.slice(0, expectedDigits);
    setRawDigits(capped);
    onChange(capped ? `${countryCode}${capped}` : "");
  };

  const formatted = formatDigits(rawDigits, currentCountry);

  return (
    <div className="space-y-1" ref={containerRef}>
      <div className="flex gap-1.5">
        {/* Country code dropdown trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDropdownOpen((o) => !o)}
          className={cn(
            "flex h-9 w-[120px] shrink-0 items-center justify-between gap-1 rounded-md border border-input bg-background px-2.5 text-sm ring-offset-background transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="text-base leading-none">{currentCountry.flag}</span>
            <span className="font-medium">{currentCountry.code}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>

        {/* Dropdown panel */}
        {dropdownOpen && (
          <div className="absolute z-50 mt-10 w-[280px] rounded-md border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95">
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search countries..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Country list */}
            <div className="max-h-60 overflow-y-auto p-1">
              {filteredCountries.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No results</p>
              )}

              {/* Priority countries */}
              {priorityCountries.map((cc) => (
                <button
                  key={cc.code + cc.country}
                  type="button"
                  onClick={() => handleCodeChange(cc)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors hover:bg-accent",
                    countryCode === cc.code && "bg-accent"
                  )}
                >
                  <span className="text-base leading-none">{cc.flag}</span>
                  <span className="flex-1 truncate text-left">{cc.label}</span>
                  <span className="text-muted-foreground">{cc.code}</span>
                  {countryCode === cc.code && (
                    <Check className="size-3.5 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}

              {/* Divider */}
              {priorityCountries.length > 0 && otherCountries.length > 0 && (
                <div className="my-1 border-t border-border" />
              )}

              {/* Other countries */}
              {otherCountries.map((cc) => (
                <button
                  key={cc.code + cc.country}
                  type="button"
                  onClick={() => handleCodeChange(cc)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors hover:bg-accent",
                    countryCode === cc.code && "bg-accent"
                  )}
                >
                  <span className="text-base leading-none">{cc.flag}</span>
                  <span className="flex-1 truncate text-left">{cc.label}</span>
                  <span className="text-muted-foreground">{cc.code}</span>
                  {countryCode === cc.code && (
                    <Check className="size-3.5 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Number input */}
        <div className="relative flex-1">
          <Input
            type="tel"
            value={formatted}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder={currentCountry.placeholder}
            disabled={disabled}
            className={cn(
              isOverflow || (!isEmpty && !isComplete && digitCount > 3)
                ? "border-red-500 focus-visible:ring-red-500 pr-8"
                : isComplete
                  ? "border-emerald-500 focus-visible:ring-emerald-500 pr-8"
                  : "pr-2"
            )}
          />
          {isComplete && (
            <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
          )}
        </div>
      </div>
      {!isEmpty && !isValid && (
        <p className="text-xs text-red-500">
          {currentCountry.label}: {expectedDigits} digits required ({digitCount} entered)
        </p>
      )}
    </div>
  );
}
