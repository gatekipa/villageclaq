"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRY_CODES = [
  { code: "+237", country: "CM", label: "Cameroon", flag: "🇨🇲" },
  { code: "+234", country: "NG", label: "Nigeria", flag: "🇳🇬" },
  { code: "+233", country: "GH", label: "Ghana", flag: "🇬🇭" },
  { code: "+254", country: "KE", label: "Kenya", flag: "🇰🇪" },
  { code: "+27", country: "ZA", label: "South Africa", flag: "🇿🇦" },
  { code: "+221", country: "SN", label: "Senegal", flag: "🇸🇳" },
  { code: "+225", country: "CI", label: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "+243", country: "CD", label: "DR Congo", flag: "🇨🇩" },
  { code: "+251", country: "ET", label: "Ethiopia", flag: "🇪🇹" },
  { code: "+255", country: "TZ", label: "Tanzania", flag: "🇹🇿" },
  { code: "+256", country: "UG", label: "Uganda", flag: "🇺🇬" },
  { code: "+250", country: "RW", label: "Rwanda", flag: "🇷🇼" },
  { code: "+1", country: "US", label: "USA/Canada", flag: "🇺🇸" },
  { code: "+44", country: "GB", label: "UK", flag: "🇬🇧" },
  { code: "+33", country: "FR", label: "France", flag: "🇫🇷" },
  { code: "+49", country: "DE", label: "Germany", flag: "🇩🇪" },
  { code: "+32", country: "BE", label: "Belgium", flag: "🇧🇪" },
  { code: "+41", country: "CH", label: "Switzerland", flag: "🇨🇭" },
  { code: "+31", country: "NL", label: "Netherlands", flag: "🇳🇱" },
  { code: "+39", country: "IT", label: "Italy", flag: "🇮🇹" },
  { code: "+34", country: "ES", label: "Spain", flag: "🇪🇸" },
  { code: "+61", country: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "+971", country: "AE", label: "UAE", flag: "🇦🇪" },
] as const;

const CURRENCY_TO_CODE: Record<string, string> = {
  XAF: "+237",
  XOF: "+221",
  NGN: "+234",
  GHS: "+233",
  KES: "+254",
  ZAR: "+27",
  USD: "+1",
  GBP: "+44",
  EUR: "+33",
  CAD: "+1",
  CHF: "+41",
};

export function getDefaultCountryCode(currency?: string | null): string {
  if (currency && CURRENCY_TO_CODE[currency]) {
    return CURRENCY_TO_CODE[currency];
  }
  return "+237"; // Default to Cameroon
}

interface PhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  defaultCountryCode?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  defaultCountryCode = "+237",
  placeholder = "670 123 456",
  disabled = false,
}: PhoneInputProps) {
  // Parse existing value into code + number
  const parsePhone = (phone: string) => {
    if (!phone) return { code: defaultCountryCode, number: "" };
    for (const cc of COUNTRY_CODES) {
      if (phone.startsWith(cc.code)) {
        return { code: cc.code, number: phone.slice(cc.code.length) };
      }
    }
    return { code: defaultCountryCode, number: phone.replace(/^\+\d+/, "") };
  };

  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = useState(parsed.code);
  const [phoneNumber, setPhoneNumber] = useState(parsed.number);

  // Update country code if defaultCountryCode changes (e.g., group context loads async)
  useEffect(() => {
    if (!value && defaultCountryCode) {
      setCountryCode(defaultCountryCode);
    }
  }, [defaultCountryCode, value]);

  const handleCodeChange = (newCode: string) => {
    if (!newCode) return;
    setCountryCode(newCode);
    onChange(phoneNumber ? `${newCode}${phoneNumber}` : "");
  };

  const handleNumberChange = (newNumber: string) => {
    // Strip non-digits and leading zeros
    const cleaned = newNumber.replace(/[^\d]/g, "");
    setPhoneNumber(cleaned);
    onChange(cleaned ? `${countryCode}${cleaned}` : "");
  };

  return (
    <div className="flex gap-1.5">
      <Select value={countryCode} onValueChange={(v) => v && handleCodeChange(v)} disabled={disabled}>
        <SelectTrigger className="w-[110px] shrink-0">
          <SelectValue>
            {COUNTRY_CODES.find((c) => c.code === countryCode)?.flag || "🌍"}{" "}
            {countryCode}
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
        value={phoneNumber}
        onChange={(e) => handleNumberChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}
