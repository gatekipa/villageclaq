"use client";

import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check } from "lucide-react";

interface CountryDef {
  code: string;
  country: string;
  label: string;
  flag: string;
  digits: number;
  placeholder: string;
  // Format pattern: array of group sizes e.g. [3,3,4] means "301 433 5857"
  groups: number[];
}

const COUNTRY_CODES: CountryDef[] = [
  { code: "+237", country: "CM", label: "Cameroon", flag: "🇨🇲", digits: 9, placeholder: "6 77 12 34 56", groups: [1, 2, 2, 2, 2] },
  { code: "+234", country: "NG", label: "Nigeria", flag: "🇳🇬", digits: 10, placeholder: "801 234 5678", groups: [3, 3, 4] },
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
  { code: "+1", country: "US", label: "USA/Canada", flag: "🇺🇸", digits: 10, placeholder: "(301) 433-5857", groups: [3, 3, 4] },
  { code: "+44", country: "GB", label: "UK", flag: "🇬🇧", digits: 10, placeholder: "7911 123 456", groups: [4, 3, 3] },
  { code: "+33", country: "FR", label: "France", flag: "🇫🇷", digits: 9, placeholder: "6 12 34 56 78", groups: [1, 2, 2, 2, 2] },
  { code: "+49", country: "DE", label: "Germany", flag: "🇩🇪", digits: 10, placeholder: "170 123 4567", groups: [3, 3, 4] },
  { code: "+32", country: "BE", label: "Belgium", flag: "🇧🇪", digits: 9, placeholder: "470 12 34 56", groups: [3, 2, 2, 2] },
  { code: "+41", country: "CH", label: "Switzerland", flag: "🇨🇭", digits: 9, placeholder: "76 123 45 67", groups: [2, 3, 2, 2] },
  { code: "+31", country: "NL", label: "Netherlands", flag: "🇳🇱", digits: 9, placeholder: "6 1234 5678", groups: [1, 4, 4] },
  { code: "+39", country: "IT", label: "Italy", flag: "🇮🇹", digits: 10, placeholder: "312 345 6789", groups: [3, 3, 4] },
  { code: "+34", country: "ES", label: "Spain", flag: "🇪🇸", digits: 9, placeholder: "612 34 56 78", groups: [3, 2, 2, 2] },
  { code: "+61", country: "AU", label: "Australia", flag: "🇦🇺", digits: 9, placeholder: "412 345 678", groups: [3, 3, 3] },
  { code: "+971", country: "AE", label: "UAE", flag: "🇦🇪", digits: 9, placeholder: "50 123 4567", groups: [2, 3, 4] },
];

const CURRENCY_TO_CODE: Record<string, string> = {
  XAF: "+237", XOF: "+221", NGN: "+234", GHS: "+233", KES: "+254",
  ZAR: "+27", USD: "+1", GBP: "+44", EUR: "+33", CAD: "+1", CHF: "+41",
};

export function getDefaultCountryCode(currency?: string | null): string {
  if (currency && CURRENCY_TO_CODE[currency]) return CURRENCY_TO_CODE[currency];
  return "+237";
}

/** Format digits into groups with spaces (or US format with parens/dash) */
function formatDigits(digits: string, country: CountryDef): string {
  if (!digits) return "";

  // Special US/Canada formatting: (301) 433-5857
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
  // Any remaining digits
  if (pos < digits.length) {
    result += " " + digits.slice(pos);
  }
  return result;
}

interface PhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  defaultCountryCode?: string;
  disabled?: boolean;
}

export function PhoneInput({ value, onChange, defaultCountryCode = "+237", disabled = false }: PhoneInputProps) {
  const parsePhone = (phone: string) => {
    if (!phone) return { code: defaultCountryCode, number: "" };
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const cc of sorted) {
      if (phone.startsWith(cc.code)) {
        return { code: cc.code, number: phone.slice(cc.code.length) };
      }
    }
    return { code: defaultCountryCode, number: phone.replace(/^\+\d+/, "") };
  };

  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = useState(parsed.code);
  const [rawDigits, setRawDigits] = useState(parsed.number);

  useEffect(() => {
    if (!value && defaultCountryCode) setCountryCode(defaultCountryCode);
  }, [defaultCountryCode, value]);

  const currentCountry = useMemo(
    () => COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0],
    [countryCode]
  );

  const digitCount = rawDigits.length;
  const expectedDigits = currentCountry.digits;
  const isComplete = digitCount === expectedDigits;
  const isOverflow = digitCount > expectedDigits;
  const isEmpty = digitCount === 0;
  const isValid = isEmpty || isComplete;

  const handleCodeChange = (newCode: string) => {
    if (!newCode) return;
    setCountryCode(newCode);
    setRawDigits(""); // Reset digits when changing country
    onChange("");
  };

  const handleNumberChange = (input: string) => {
    const cleaned = input.replace(/[^\d]/g, "");
    // Cap at max digits for this country
    const capped = cleaned.slice(0, expectedDigits);
    setRawDigits(capped);
    onChange(capped ? `${countryCode}${capped}` : "");
  };

  const formatted = formatDigits(rawDigits, currentCountry);

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Select value={countryCode} onValueChange={(v) => v && handleCodeChange(v)} disabled={disabled}>
          <SelectTrigger className="w-[110px] shrink-0">
            <SelectValue>
              {currentCountry.flag} {countryCode}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {COUNTRY_CODES.map((cc) => (
              <SelectItem key={cc.code + cc.country} value={cc.code}>
                {cc.flag} {cc.code} {cc.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Input
            type="tel"
            value={formatted}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder={currentCountry.placeholder}
            disabled={disabled}
            className={
              isOverflow || (!isEmpty && !isComplete && digitCount > 3)
                ? "border-red-500 focus-visible:ring-red-500 pr-8"
                : isComplete
                  ? "border-emerald-500 focus-visible:ring-emerald-500 pr-8"
                  : "pr-2"
            }
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
