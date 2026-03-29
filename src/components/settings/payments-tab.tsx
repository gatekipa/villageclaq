"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  CreditCard,
  Loader2,
  Save,
  Plus,
  X,
  Smartphone,
  Building2,
  DollarSign,
  Wallet,
  Globe,
  FileText,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface MobileMoneyProvider {
  provider: string;
  number: string;
  name: string;
}

const MOBILE_MONEY_PROVIDERS = [
  "MTN MoMo",
  "Orange Money",
  "Airtel Money",
  "M-Pesa",
  "Wave",
] as const;

export function PaymentsTab() {
  const t = useTranslations("settings");
  const { groupId } = useGroup();
  const queryClient = useQueryClient();

  // ── State ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Toggles
  const [cashEnabled, setCashEnabled] = useState(true);
  const [cashappEnabled, setCashappEnabled] = useState(false);
  const [zelleEnabled, setZelleEnabled] = useState(false);
  const [mobileMoneyEnabled, setMobileMoneyEnabled] = useState(false);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [flutterwaveEnabled, setFlutterwaveEnabled] = useState(false);

  // CashApp
  const [cashappTag, setCashappTag] = useState("");
  const [cashappDisplayName, setCashappDisplayName] = useState("");

  // Zelle
  const [zelleEmail, setZelleEmail] = useState("");
  const [zellePhone, setZellePhone] = useState("");
  const [zelleDisplayName, setZelleDisplayName] = useState("");

  // Mobile Money
  const [mobileProviders, setMobileProviders] = useState<MobileMoneyProvider[]>([]);

  // Bank Transfer
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankRoutingNumber, setBankRoutingNumber] = useState("");
  const [bankSwiftCode, setBankSwiftCode] = useState("");
  const [bankBranch, setBankBranch] = useState("");

  // Flutterwave
  const [flutterwaveCurrency, setFlutterwaveCurrency] = useState("");

  // Payment Instructions
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [paymentInstructionsFr, setPaymentInstructionsFr] = useState("");

  // ── Load config ──
  const { data: config, isLoading } = useQuery({
    queryKey: ["group-payment-config", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("group_payment_config")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Populate form from config ──
  const populateForm = useCallback((cfg: Record<string, unknown> | null) => {
    if (!cfg) return;
    setCashEnabled(cfg.cash_enabled as boolean ?? true);
    setCashappEnabled(cfg.cashapp_enabled as boolean ?? false);
    setZelleEnabled(cfg.zelle_enabled as boolean ?? false);
    setMobileMoneyEnabled(cfg.mobile_money_enabled as boolean ?? false);
    setBankTransferEnabled(cfg.bank_transfer_enabled as boolean ?? false);
    setFlutterwaveEnabled(cfg.flutterwave_enabled as boolean ?? false);

    setCashappTag((cfg.cashapp_tag as string) || "");
    setCashappDisplayName((cfg.cashapp_display_name as string) || "");

    setZelleEmail((cfg.zelle_email as string) || "");
    setZellePhone((cfg.zelle_phone as string) || "");
    setZelleDisplayName((cfg.zelle_display_name as string) || "");

    const providers = cfg.mobile_money_providers;
    if (Array.isArray(providers)) {
      setMobileProviders(providers as MobileMoneyProvider[]);
    }

    setBankName((cfg.bank_name as string) || "");
    setBankAccountName((cfg.bank_account_name as string) || "");
    setBankAccountNumber((cfg.bank_account_number as string) || "");
    setBankRoutingNumber((cfg.bank_routing_number as string) || "");
    setBankSwiftCode((cfg.bank_swift_code as string) || "");
    setBankBranch((cfg.bank_branch as string) || "");

    setFlutterwaveCurrency((cfg.flutterwave_currency as string) || "");

    setPaymentInstructions((cfg.payment_instructions as string) || "");
    setPaymentInstructionsFr((cfg.payment_instructions_fr as string) || "");
  }, []);

  useEffect(() => {
    if (config) populateForm(config as Record<string, unknown>);
  }, [config, populateForm]);

  // ── Save ──
  async function handleSave() {
    if (!groupId) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const supabase = createClient();
      const payload = {
        group_id: groupId,
        cash_enabled: cashEnabled,
        cashapp_enabled: cashappEnabled,
        zelle_enabled: zelleEnabled,
        mobile_money_enabled: mobileMoneyEnabled,
        bank_transfer_enabled: bankTransferEnabled,
        flutterwave_enabled: flutterwaveEnabled,
        cashapp_tag: cashappEnabled ? cashappTag.trim() || null : null,
        cashapp_display_name: cashappEnabled ? cashappDisplayName.trim() || null : null,
        zelle_email: zelleEnabled ? zelleEmail.trim() || null : null,
        zelle_phone: zelleEnabled ? zellePhone.trim() || null : null,
        zelle_display_name: zelleEnabled ? zelleDisplayName.trim() || null : null,
        mobile_money_providers: mobileMoneyEnabled ? mobileProviders.filter((p) => p.number.trim()) : [],
        bank_name: bankTransferEnabled ? bankName.trim() || null : null,
        bank_account_name: bankTransferEnabled ? bankAccountName.trim() || null : null,
        bank_account_number: bankTransferEnabled ? bankAccountNumber.trim() || null : null,
        bank_routing_number: bankTransferEnabled ? bankRoutingNumber.trim() || null : null,
        bank_swift_code: bankTransferEnabled ? bankSwiftCode.trim() || null : null,
        bank_branch: bankTransferEnabled ? bankBranch.trim() || null : null,
        flutterwave_currency: flutterwaveEnabled ? flutterwaveCurrency.trim() || null : null,
        payment_instructions: paymentInstructions.trim() || null,
        payment_instructions_fr: paymentInstructionsFr.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("group_payment_config")
        .upsert(payload, { onConflict: "group_id" });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["group-payment-config", groupId] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg.includes("schema cache")) {
        setSaveError(t("pay.schemaError"));
      } else {
        setSaveError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Mobile Money helpers ──
  function addProvider() {
    setMobileProviders((prev) => [...prev, { provider: "MTN MoMo", number: "", name: "" }]);
  }

  function removeProvider(index: number) {
    setMobileProviders((prev) => prev.filter((_, i) => i !== index));
  }

  function updateProvider(index: number, field: keyof MobileMoneyProvider, value: string) {
    setMobileProviders((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cash ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              {t("pay.cashTitle")}
            </CardTitle>
            <Switch checked={cashEnabled} onCheckedChange={setCashEnabled} />
          </div>
          <p className="text-sm text-muted-foreground">{t("pay.cashDesc")}</p>
        </CardHeader>
      </Card>

      {/* ── CashApp ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4" />
              {t("pay.cashappTitle")}
            </CardTitle>
            <Switch checked={cashappEnabled} onCheckedChange={setCashappEnabled} />
          </div>
          <p className="text-sm text-muted-foreground">{t("pay.cashappDesc")}</p>
        </CardHeader>
        {cashappEnabled && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.cashappTag")}</Label>
                <Input
                  value={cashappTag}
                  onChange={(e) => setCashappTag(e.target.value)}
                  placeholder="$YourTag"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.cashappName")}</Label>
                <Input
                  value={cashappDisplayName}
                  onChange={(e) => setCashappDisplayName(e.target.value)}
                  placeholder={t("pay.cashappNamePlaceholder")}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Zelle ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              {t("pay.zelleTitle")}
            </CardTitle>
            <Switch checked={zelleEnabled} onCheckedChange={setZelleEnabled} />
          </div>
          <p className="text-sm text-muted-foreground">{t("pay.zelleDesc")}</p>
        </CardHeader>
        {zelleEnabled && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.zelleEmail")}</Label>
                <Input
                  type="email"
                  value={zelleEmail}
                  onChange={(e) => setZelleEmail(e.target.value)}
                  placeholder="name@email.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.zellePhone")}</Label>
                <Input
                  value={zellePhone}
                  onChange={(e) => setZellePhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.zelleName")}</Label>
                <Input
                  value={zelleDisplayName}
                  onChange={(e) => setZelleDisplayName(e.target.value)}
                  placeholder={t("pay.zelleNamePlaceholder")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("pay.zelleHint")}</p>
          </CardContent>
        )}
      </Card>

      {/* ── Mobile Money ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" />
              {t("pay.mobileMoneyTitle")}
            </CardTitle>
            <Switch checked={mobileMoneyEnabled} onCheckedChange={setMobileMoneyEnabled} />
          </div>
          <p className="text-sm text-muted-foreground">{t("pay.mobileMoneyDesc")}</p>
        </CardHeader>
        {mobileMoneyEnabled && (
          <CardContent className="space-y-4 pt-0">
            {mobileProviders.map((provider, index) => (
              <div key={index} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pay.provider")}</Label>
                    <select
                      value={provider.provider}
                      onChange={(e) => updateProvider(index, "provider", e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
                    >
                      {MOBILE_MONEY_PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pay.mobileNumber")}</Label>
                    <Input
                      value={provider.number}
                      onChange={(e) => updateProvider(index, "number", e.target.value)}
                      placeholder="+237 6XX XXX XXX"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pay.accountName")}</Label>
                    <Input
                      value={provider.name}
                      onChange={(e) => updateProvider(index, "name", e.target.value)}
                      placeholder={t("pay.accountNamePlaceholder")}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeProvider(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addProvider} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              {t("pay.addProvider")}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── Bank Transfer ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              {t("pay.bankTitle")}
            </CardTitle>
            <Switch checked={bankTransferEnabled} onCheckedChange={setBankTransferEnabled} />
          </div>
          <p className="text-sm text-muted-foreground">{t("pay.bankDesc")}</p>
        </CardHeader>
        {bankTransferEnabled && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.bankName")}</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder={t("pay.bankNamePlaceholder")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.bankAccountName")}</Label>
                <Input
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder={t("pay.bankAccountNamePlaceholder")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.bankAccountNumber")}</Label>
                <Input
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="XXXX XXXX XXXX"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.bankRouting")}</Label>
                <Input
                  value={bankRoutingNumber}
                  onChange={(e) => setBankRoutingNumber(e.target.value)}
                  placeholder={t("pay.bankRoutingPlaceholder")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.bankSwift")}</Label>
                <Input
                  value={bankSwiftCode}
                  onChange={(e) => setBankSwiftCode(e.target.value)}
                  placeholder="XXXXUSXX"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pay.bankBranch")}</Label>
                <Input
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value)}
                  placeholder={t("pay.bankBranchPlaceholder")}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Online Payments (Flutterwave) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              {t("pay.flutterwaveTitle")}
            </CardTitle>
            <Switch checked={flutterwaveEnabled} onCheckedChange={setFlutterwaveEnabled} />
          </div>
          <p className="text-sm text-muted-foreground">{t("pay.flutterwaveDesc")}</p>
        </CardHeader>
        {flutterwaveEnabled && (
          <CardContent className="space-y-4 pt-0">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
              <p className="text-sm text-blue-800 dark:text-blue-300">{t("pay.flutterwaveInfo")}</p>
            </div>
            <div className="max-w-xs space-y-1">
              <Label className="text-xs">{t("pay.flutterwaveCurrency")}</Label>
              <Input
                value={flutterwaveCurrency}
                onChange={(e) => setFlutterwaveCurrency(e.target.value)}
                placeholder="NGN, USD, XAF..."
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Payment Instructions ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            {t("pay.instructionsTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("pay.instructionsDesc")}</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-1">
            <Label className="text-xs">{t("pay.instructionsEn")}</Label>
            <Textarea
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              rows={3}
              placeholder={t("pay.instructionsPlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("pay.instructionsFr")}</Label>
            <Textarea
              value={paymentInstructionsFr}
              onChange={(e) => setPaymentInstructionsFr(e.target.value)}
              rows={3}
              placeholder={t("pay.instructionsPlaceholderFr")}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Save ── */}
      <div className="space-y-2">
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {saveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("pay.saved")}</p>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t("pay.saveConfig")}
        </Button>
      </div>
    </div>
  );
}
