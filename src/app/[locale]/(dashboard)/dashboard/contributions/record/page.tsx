"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Loader2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import {
  useMembers,
  useContributionTypes,
  useRecordPayment,
} from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { Shield } from "lucide-react";


export default function RecordPaymentPage() {
  const t = useTranslations();
  const { currentGroup, groupId } = useGroup();
  const { hasPermission } = usePermissions();
  const canRecord = hasPermission("finances.record") || hasPermission("finances.manage");
  const { data: members, isLoading: membersLoading, isError: membersError, refetch: refetchMembers } = useMembers();
  const { data: contributionTypes, isLoading: typesLoading, isError: typesError, refetch: refetchTypes } = useContributionTypes();
  const recordPayment = useRecordPayment();

  const currency = currentGroup?.currency || "XAF";

  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembership, setSelectedMembership] = useState<{ id: string; name: string } | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [showMemberList, setShowMemberList] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSavedName, setLastSavedName] = useState("");
  const memberInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLoading = membersLoading || typesLoading;
  const isError = membersError || typesError;

  const memberList = (members || []).map((m: Record<string, unknown>) => {
    const profile = m.profile as { full_name?: string; avatar_url?: string } | undefined;
    return {
      membershipId: m.id as string,
      name: (m.display_name as string) || profile?.full_name || "Unknown",
      avatarUrl: profile?.avatar_url || null,
    };
  });

  const filteredMembers = memberList.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const types = contributionTypes || [];
  const selectedType = types.find((ct: Record<string, unknown>) => ct.id === selectedTypeId);

  // Auto-fill amount when contribution type changes
  useEffect(() => {
    if (selectedType) {
      setAmount(String(selectedType.amount));
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

  function handleSelectMember(member: { membershipId: string; name: string }) {
    setSelectedMembership({ id: member.membershipId, name: member.name });
    setMemberSearch(member.name);
    setShowMemberList(false);
  }

  async function handleSave(keepTypeAndMethod: boolean) {
    if (!selectedMembership || !selectedTypeId || !amount) return;

    try {
      const paymentResult = await recordPayment.mutateAsync({
        membership_id: selectedMembership.id,
        contribution_type_id: selectedTypeId,
        amount: Number(amount),
        currency,
        payment_method: method,
        reference_number: reference || undefined,
        receipt_url: receiptUrl && !receiptUrl.startsWith("pending:") ? receiptUrl : undefined,
        notes: notes || undefined,
      });

      // Send payment receipt notification to the member
      const typeName = contributionTypes?.find((ct: Record<string, unknown>) => ct.id === selectedTypeId)?.name as string || "";
      try {
        const supabase = createClient();
        // Find the user_id for this membership
        const { data: membership } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("id", selectedMembership.id)
          .single();
        if (membership?.user_id) {
          await supabase.from("notifications").insert({
            user_id: membership.user_id,
            group_id: groupId,
            type: "contribution_received",
            title: `Payment of ${formatAmount(Number(amount), currency)} received`,
            body: `Payment of ${formatAmount(Number(amount), currency)} received for ${typeName}. Method: ${method}. Reference: ${reference || "N/A"}.`,
            is_read: false,
            data: { amount: Number(amount), currency, contribution_type: typeName, method, reference: reference || null },
          });
        }
      } catch {
        // Non-critical — don't block the payment flow
      }

      setLastSavedName(selectedMembership.name);
      setShowSuccess(true);

      // Clear member fields always
      setSelectedMembership(null);
      setMemberSearch("");
      setReference("");
      setNotes("");

      if (!keepTypeAndMethod) {
        // Full clear
        setAmount("");
        setSelectedTypeId("");
        setMethod("cash");
      }

      setTimeout(() => setShowSuccess(false), 3000);
      memberInputRef.current?.focus();
    } catch {
      // error displayed via mutation state
    }
  }

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) {
    return (
      <RequirePermission anyOf={["finances.record", "finances.manage"]}><div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
          <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subNavItems.map((item) => (
            <Link key={item.key} href={item.href}>
              <Button variant={item.key === "record" ? "default" : "outline"} size="sm" className="shrink-0">
                <item.icon className="mr-1.5 h-3.5 w-3.5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>
        <ListSkeleton rows={4} />
      </div></RequirePermission>
    );
  }

  if (isError) {
    return (
      <RequirePermission anyOf={["finances.record", "finances.manage"]}><div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
          <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
        </div>
        <ErrorState onRetry={() => { refetchMembers(); refetchTypes(); }} />
      </div></RequirePermission>
    );
  }

  const canSubmit = !!selectedMembership && !!selectedTypeId && !!amount && !recordPayment.isPending;

  if (!canRecord) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-semibold">{t("roles.accessDenied")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("roles.accessDeniedDesc")}</p>
      </div>
    );
  }

  return (
    <RequirePermission anyOf={["finances.record", "finances.manage"]}><div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
        <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button variant={item.key === "record" ? "default" : "outline"} size="sm" className="shrink-0">
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
                    setSelectedMembership(null);
                    setShowMemberList(true);
                  }}
                  onFocus={() => setShowMemberList(true)}
                  className="pl-9"
                  autoComplete="off"
                />
                {selectedMembership && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => {
                      setSelectedMembership(null);
                      setMemberSearch("");
                      memberInputRef.current?.focus();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {showMemberList && !selectedMembership && memberSearch.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full max-w-md overflow-auto rounded-md border bg-popover shadow-md">
                  {filteredMembers.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</p>
                  ) : (
                    filteredMembers.map((member) => (
                      <button
                        key={member.membershipId}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                        onClick={() => handleSelectMember(member)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
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
              <select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              >
                <option value="">{t("contributions.selectType")}</option>
                {types.map((type: Record<string, unknown>) => (
                  <option key={type.id as string} value={type.id as string}>
                    {type.name as string} — {formatAmount(Number(type.amount), (type.currency as string) || currency)}
                  </option>
                ))}
              </select>
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
                {selectedType && amount && Number(amount) !== Number(selectedType.amount) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("contributions.amountDiffers", {
                      expected: formatAmount(Number(selectedType.amount), (selectedType.currency as string) || currency),
                    })}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("contributions.paymentMethod")}</Label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                >
                  <option value="cash">{t("contributions.cash")}</option>
                  <option value="mobile_money">{t("contributions.mobileMoney")}</option>
                  <option value="bank_transfer">{t("contributions.bankTransfer")}</option>
                  <option value="online">{t("contributions.online")}</option>
                </select>
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
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    id="receipt-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !groupId) return;
                      try {
                        const supabase = createClient();
                        const path = `${groupId}/${Date.now()}-${file.name}`;
                        const { error: uploadErr } = await supabase.storage
                          .from("receipts")
                          .upload(path, file);
                        if (uploadErr) {
                          setReceiptUrl(`pending:${file.name}`);
                        } else {
                          const { data: urlData } = supabase.storage
                            .from("receipts")
                            .getPublicUrl(path);
                          setReceiptUrl(urlData.publicUrl);
                        }
                      } catch {
                        setReceiptUrl(`pending:${file.name}`);
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    className="flex-1"
                    type="button"
                    onClick={() => document.getElementById("receipt-upload")?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {receiptUrl ? "✓ " + (receiptUrl.startsWith("pending:") ? receiptUrl.slice(8) : t("contributions.receiptUploaded")) : t("contributions.uploadReceipt")}
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

            {/* Error display */}
            {recordPayment.isError && (
              <p className="text-sm text-destructive">
                {(recordPayment.error as Error)?.message || "Failed to record payment."}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={!canSubmit}
              >
                {recordPayment.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {t("contributions.savePayment")}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={!canSubmit}
              >
                {recordPayment.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
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
            <li>&#8226; {t("contributions.quickTip1")}</li>
            <li>&#8226; {t("contributions.quickTip2")}</li>
            <li>&#8226; {t("contributions.quickTip3")}</li>
          </ul>
        </CardContent>
      </Card>
    </div></RequirePermission>
  );
}
