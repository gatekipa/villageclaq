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

const COUNTRY_CODES = [
  { code: "+237", country: "CM", label: "Cameroon", flag: "🇨🇲", digits: 9, placeholder: "6 77 12 34 56" },
  { code: "+234", country: "NG", label: "Nigeria", flag: "🇳🇬", digits: 10, placeholder: "801 234 5678" },
  { code: "+233", country: "GH", label: "Ghana", flag: "🇬🇭", digits: 9, placeholder: "24 123 4567" },
  { code: "+254", country: "KE", label: "Kenya", flag: "🇰🇪", digits: 9, placeholder: "712 345 678" },
  { code: "+27", country: "ZA", label: "South Africa", flag: "🇿🇦", digits: 9, placeholder: "71 123 4567" },
  { code: "+221", country: "SN", label: "Senegal", flag: "🇸🇳", digits: 9, placeholder: "77 123 45 67" },
  { code: "+225", country: "CI", label: "Côte d'Ivoire", flag: "🇨🇮", digits: 10, placeholder: "07 12 34 56 78" },
  { code: "+243", country: "CD", label: "DR Congo", flag: "🇨🇩", digits: 9, placeholder: "81 234 5678" },
  { code: "+251", country: "ET", label: "Ethiopia", flag: "🇪🇹", digits: 9, placeholder: "91 234 5678" },
  { code: "+255", country: "TZ", label: "Tanzania", flag: "🇹🇿", digits: 9, placeholder: "71 234 5678" },
  { code: "+256", country: "UG", label: "Uganda", flag: "🇺🇬", digits: 9, placeholder: "77 123 4567" },
  { code: "+250", country: "RW", label: "Rwanda", flag: "🇷🇼", digits: 9, placeholder: "78 123 4567" },
  { code: "+1", country: "US", label: "USA/Canada", flag: "🇺🇸", digits: 10, placeholder: "301 433 5857" },
  { code: "+44", country: "GB", label: "UK", flag: "🇬🇧", digits: 10, placeholder: "7911 123456" },
  { code: "+33", country: "FR", label: "France", flag: "🇫🇷", digits: 9, placeholder: "6 12 34 56 78" },
  { code: "+49", country: "DE", label: "Germany", flag: "🇩🇪", digits: 10, placeholder: "170 1234567" },
  { code: "+32", country: "BE", label: "Belgium", flag: "🇧🇪", digits: 9, placeholder: "470 12 34 56" },
  { code: "+41", country: "CH", label: "Switzerland", flag: "🇨🇭", digits: 9, placeholder: "76 123 45 67" },
  { code: "+31", country: "NL", label: "Netherlands", flag: "🇳🇱", digits: 9, placeholder: "6 12345678" },
  { code: "+39", country: "IT", label: "Italy", flag: "🇮🇹", digits: 10, placeholder: "312 345 6789" },
  { code: "+34", country: "ES", label: "Spain", flag: "🇪🇸", digits: 9, placeholder: "612 34 56 78" },
  { code: "+61", country: "AU", label: "Australia", flag: "🇦🇺", digits: 9, placeholder: "412 345 678" },
  { code: "+971", country: "AE", label: "UAE", flag: "🇦🇪", digits: 9, placeholder: "50 123 4567" },
] as const;

const CURRENCY_TO_CODE: Record<string, string> = {
  XAF: "+237", XOF: "+221", NGN: "+234", GHS: "+233", KES: "+254",
  ZAR: "+27", USD: "+1", GBP: "+44", EUR: "+33", CAD: "+1", CHF: "+41",
};

export function getDefaultCountryCode(currency?: string | null): string {
  if (currency && CURRENCY_TO_CODE[currency]) return CURRENCY_TO_CODE[currency];
  return "+237";
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
    // Try longest codes first to avoid +2 matching before +237
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
  const isValid = digitCount === 0 || digitCount === expectedDigits;
  const validationMsg = !isValid
    ? `${currentCountry.label}: ${expectedDigits} digits expected (${digitCount} entered)`
    : "";

  const handleCodeChange = (newCode: string) => {
    if (!newCode) return;
    setCountryCode(newCode);
    onChange(rawDigits ? `${newCode}${rawDigits}` : "");
  };

  const handleNumberChange = (input: string) => {
    const cleaned = input.replace(/[^\d]/g, "");
    setRawDigits(cleaned);
    onChange(cleaned ? `${countryCode}${cleaned}` : "");
  };

  // Format display: insert spaces for readability
  const formatDisplay = (digits: string): string => {
    if (!digits) return "";
    // Simple grouping: groups of 3 from the left
    return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  };

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
        <Input
          type="tel"
          value={formatDisplay(rawDigits)}
          onChange={(e) => handleNumberChange(e.target.value)}
          placeholder={currentCountry.placeholder}
          disabled={disabled}
          className={`flex-1 ${!isValid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
        />
      </div>
      {validationMsg && (
        <p className="text-xs text-red-500">{validationMsg}</p>
      )}
    </div>
  );
}
