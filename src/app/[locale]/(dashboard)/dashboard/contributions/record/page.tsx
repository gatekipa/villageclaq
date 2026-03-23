"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CreditCard,
  Search,
  Check,
  Upload,
  HandCoins,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
  X,
  Share2,
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  avatarUrl?: string;
  standing: string;
}

interface ContributionType {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
}

const mockMembers: Member[] = [
  { id: "1", name: "Cyril Ndonwi", standing: "good" },
  { id: "2", name: "Jean-Pierre Kamga", standing: "good" },
  { id: "3", name: "Sylvie Mbarga", standing: "good" },
  { id: "4", name: "Emmanuel Tabi", standing: "good" },
  { id: "5", name: "Marie-Claire Fotso", standing: "good" },
  { id: "6", name: "Patrick Njoya", standing: "warning" },
  { id: "7", name: "Beatrice Ngono", standing: "good" },
  { id: "8", name: "Thomas Nkeng", standing: "suspended" },
  { id: "9", name: "Papa François Mbeki", standing: "good" },
  { id: "10", name: "Angeline Tchatchouang", standing: "good" },
  { id: "11", name: "Samuel Fon", standing: "warning" },
  { id: "12", name: "Grace Eteki", standing: "good" },
];

const mockContributionTypes: ContributionType[] = [
  { id: "1", name: "Annual Dues", amount: 50000, currency: "XAF", frequency: "annual" },
  { id: "2", name: "Monthly Contribution", amount: 15000, currency: "XAF", frequency: "monthly" },
  { id: "3", name: "Building Fund Levy", amount: 100000, currency: "XAF", frequency: "one_time" },
  { id: "4", name: "Quarterly Social Fund", amount: 25000, currency: "XAF", frequency: "quarterly" },
];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function RecordPaymentPage() {
  const t = useTranslations();
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [showMemberList, setShowMemberList] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSavedName, setLastSavedName] = useState("");
  const memberInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredMembers = mockMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const selectedType = mockContributionTypes.find((t) => t.id === selectedTypeId);

  // Auto-fill amount when contribution type changes
  useEffect(() => {
    if (selectedType) {
      setAmount(selectedType.amount.toString());
    }
  }, [selectedType]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMemberList(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelectMember(member: Member) {
    setSelectedMember(member);
    setMemberSearch(member.name);
    setShowMemberList(false);
  }

  function handleSaveAndNext() {
    if (!selectedMember || !selectedTypeId || !amount) return;
    setLastSavedName(selectedMember.name);
    setShowSuccess(true);
    // Clear member but keep everything else
    setSelectedMember(null);
    setMemberSearch("");
    setReference("");
    setNotes("");
    setTimeout(() => setShowSuccess(false), 3000);
    memberInputRef.current?.focus();
  }

  function handleSave() {
    if (!selectedMember || !selectedTypeId || !amount) return;
    setLastSavedName(selectedMember.name);
    setShowSuccess(true);
    // Clear everything
    setSelectedMember(null);
    setMemberSearch("");
    setAmount("");
    setSelectedTypeId("");
    setMethod("cash");
    setReference("");
    setNotes("");
    setTimeout(() => setShowSuccess(false), 3000);
  }

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
        <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "record" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-lg animate-in slide-in-from-bottom-4">
          <Check className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium">{t("contributions.paymentSaved")}</p>
            <p className="text-xs opacity-90">{lastSavedName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10"
            title={t("contributions.shareWhatsApp")}
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10"
            onClick={() => setShowSuccess(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Record Payment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" />
            {t("contributions.quickRecord")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Member Autocomplete */}
            <div className="space-y-2" ref={dropdownRef}>
              <Label>{t("contributions.member")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={memberInputRef}
                  placeholder={t("contributions.searchMember")}
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setSelectedMember(null);
                    setShowMemberList(true);
                  }}
                  onFocus={() => setShowMemberList(true)}
                  className="pl-9"
                  autoComplete="off"
                />
                {selectedMember && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => {
                      setSelectedMember(null);
                      setMemberSearch("");
                      memberInputRef.current?.focus();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {showMemberList && !selectedMember && memberSearch.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full max-w-md overflow-auto rounded-md border bg-popover shadow-md">
                  {filteredMembers.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</p>
                  ) : (
                    filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                        onClick={() => handleSelectMember(member)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {member.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Contribution Type */}
            <div className="space-y-2">
              <Label>{t("contributions.contributionType")}</Label>
              <Select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
              >
                <option value="">{t("contributions.selectType")}</option>
                {mockContributionTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} — {formatCurrency(type.amount, type.currency)}
                  </option>
                ))}
              </Select>
            </div>

            {/* Amount + Method Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("contributions.amount")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
                {selectedType && amount && Number(amount) !== selectedType.amount && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("contributions.amountDiffers", { expected: formatCurrency(selectedType.amount, selectedType.currency) })}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("contributions.paymentMethod")}</Label>
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">{t("contributions.cash")}</option>
                  <option value="mobile_money">{t("contributions.mobileMoney")}</option>
                  <option value="bank_transfer">{t("contributions.bankTransfer")}</option>
                  <option value="online">{t("contributions.online")}</option>
                </Select>
              </div>
            </div>

            {/* Reference + Receipt Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("contributions.referenceNumber")}</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t("contributions.referenceOptional")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("contributions.receiptPhoto")}</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="flex-1" type="button">
                    <Upload className="mr-2 h-4 w-4" />
                    {t("contributions.uploadReceipt")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t("contributions.notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("contributions.notesOptional")}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!selectedMember || !selectedTypeId || !amount}
              >
                <Check className="mr-2 h-4 w-4" />
                {t("contributions.savePayment")}
              </Button>
              <Button
                onClick={handleSaveAndNext}
                disabled={!selectedMember || !selectedTypeId || !amount}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {t("contributions.saveAndNext")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Tips */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <p className="text-sm font-medium text-primary">{t("contributions.quickTipsTitle")}</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>• {t("contributions.quickTip1")}</li>
            <li>• {t("contributions.quickTip2")}</li>
            <li>• {t("contributions.quickTip3")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
