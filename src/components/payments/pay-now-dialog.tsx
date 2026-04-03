"use client";

import { useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Copy,
  Check,
  DollarSign,
  CreditCard,
  Smartphone,
  Building2,
  Upload,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatAmount } from "@/lib/currencies";

interface Obligation {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  contribution_type_id: string;
  contribution_type?: { name?: string; name_fr?: string };
}

interface PayNowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obligation: Obligation;
  membershipId: string;
}

interface MobileMoneyProvider {
  provider: string;
  number: string;
  name: string;
}

type PaymentMethod = "cashapp" | "zelle" | "mobile_money" | "bank_transfer";

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  cashapp: <DollarSign className="h-5 w-5" />,
  zelle: <CreditCard className="h-5 w-5" />,
  mobile_money: <Smartphone className="h-5 w-5" />,
  bank_transfer: <Building2 className="h-5 w-5" />,
};

export function PayNowDialog({
  open,
  onOpenChange,
  obligation,
  membershipId,
}: PayNowDialogProps) {
  const t = useTranslations("payNow");
  const locale = useLocale();
  const { groupId, currentGroup, user } = useGroup();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || obligation.currency || "XAF";
  const amountDue = obligation.amount - (obligation.amount_paid || 0);

  // Steps: "choose" → "details" → "confirm" → "success"
  const [step, setStep] = useState<"choose" | "details" | "confirm" | "success">("choose");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Confirm form
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Load payment config
  const { data: paymentConfig } = useQuery({
    queryKey: ["group-payment-config", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const { data } = await supabase
        .from("group_payment_config")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      return data as Record<string, unknown> | null;
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  // Build available self-service methods
  const availableMethods: { key: PaymentMethod; label: string }[] = [];
  if (paymentConfig?.cashapp_enabled) availableMethods.push({ key: "cashapp", label: t("cashapp") });
  if (paymentConfig?.zelle_enabled) availableMethods.push({ key: "zelle", label: t("zelle") });
  if (paymentConfig?.mobile_money_enabled) availableMethods.push({ key: "mobile_money", label: t("mobileMoney") });
  if (paymentConfig?.bank_transfer_enabled) availableMethods.push({ key: "bank_transfer", label: t("bankTransfer") });

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback — some browsers block clipboard
    }
  }, []);

  function handleSelectMethod(method: PaymentMethod) {
    setSelectedMethod(method);
    setStep("details");
  }

  function handleIvePaid() {
    setStep("confirm");
  }

  function resetDialog() {
    setStep("choose");
    setSelectedMethod(null);
    setReference("");
    setNotes("");
    setReceiptFile(null);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!groupId || !user || !selectedMethod) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = createClient();

      // Upload receipt if provided
      let receiptUrl: string | undefined;
      if (receiptFile) {
        if (receiptFile.size > 5 * 1024 * 1024) {
          setSubmitError(t("fileTooLarge"));
          setSubmitting(false);
          return;
        }
        const path = `${groupId}/${Date.now()}-${receiptFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("receipts")
          .upload(path, receiptFile);
        if (uploadErr) {
          setSubmitError(uploadErr.message);
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage
          .from("receipts")
          .getPublicUrl(path);
        receiptUrl = urlData.publicUrl;
      }

      // Insert payment with pending_confirmation status
      const { error: paymentError } = await supabase.from("payments").insert({
        group_id: groupId,
        membership_id: membershipId,
        obligation_id: obligation.id,
        contribution_type_id: obligation.contribution_type_id,
        amount: amountDue,
        currency,
        payment_method: selectedMethod,
        reference_number: reference.trim() || null,
        receipt_url: receiptUrl || null,
        notes: notes.trim() || null,
        recorded_by: user.id,
        status: "pending_confirmation",
      });

      if (paymentError) throw paymentError;

      // Send notification to group admins
      const { data: admins } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("group_id", groupId)
        .in("role", ["owner", "admin"])
        .not("user_id", "is", null);

      if (admins && admins.length > 0) {
        const ctName = obligation.contribution_type?.name || "";
        const notifications = admins
          .filter((a) => a.user_id && a.user_id !== user.id)
          .map((a) => ({
            user_id: a.user_id,
            group_id: groupId,
            type: "contribution_received" as const,
            title: t("adminNotifTitle"),
            body: t("adminNotifBody", {
              amount: formatAmount(amountDue, currency),
              type: ctName,
              method: selectedMethod,
            }),
            is_read: false,
            data: { link: "/dashboard/my-payments", payment_method: selectedMethod, amount: amountDue, currency },
          }));
        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      // Notify the paying member via Email + WhatsApp (fire-and-forget)
      try {
        const { notifyFromClient } = await import("@/lib/notify-client");
        const ctName = obligation.contribution_type?.name || "";
        notifyFromClient({
          recipientUserId: user.id,
          groupId: groupId!,
          title: t("paymentSubmittedTitle"),
          body: t("paymentSubmittedBody", { amount: formatAmount(amountDue, currency), type: ctName }),
          data: {
            memberName: "",
            amount: formatAmount(amountDue, currency),
            contributionType: ctName,
            type: ctName,
            groupName: "",
            date: new Date().toISOString().slice(0, 10),
          },
          emailTemplate: "payment-receipt",
          smsTemplate: "payment-receipt",
          whatsappType: "payment_receipt",
          inAppType: "contribution_received",
          locale: "en",
          channels: { inApp: true, email: true, sms: true, whatsapp: true },
          prefType: "payment_reminders",
        }).catch(() => {});
      } catch { /* best-effort */ }

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["payments", groupId] });
      queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
      queryClient.invalidateQueries({ queryKey: ["member-payments"] });
      queryClient.invalidateQueries({ queryKey: ["member-obligations"] });

      setStep("success");
    } catch (err) {
      setSubmitError((err as Error).message || t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(resetDialog, 300);
  }

  // Render helpers
  function CopyButton({ text, field }: { text: string; field: string }) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => copyToClipboard(text, field)}
      >
        {copiedField === field ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    );
  }

  function DetailRow({ label, value, copyField }: { label: string; value: string; copyField?: string }) {
    if (!value) return null;
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium break-all">{value}</p>
        </div>
        {copyField && <CopyButton text={value} field={copyField} />}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "success" ? t("successTitle") : t("dialogTitle")}
          </DialogTitle>
        </DialogHeader>

        {/* Amount banner */}
        {step !== "success" && (
          <div className="rounded-lg bg-primary/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("amountToPay")}</p>
            <p className="text-2xl font-bold text-primary">{formatAmount(amountDue, currency)}</p>
            {obligation.contribution_type?.name && (
              <p className="text-xs text-muted-foreground mt-1">
                {locale === "fr" && obligation.contribution_type?.name_fr
                  ? obligation.contribution_type.name_fr
                  : obligation.contribution_type.name}
              </p>
            )}
          </div>
        )}

        {/* STEP 1: Choose method */}
        {step === "choose" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("chooseMethod")}</p>
            {availableMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("noMethods")}</p>
            ) : (
              <div className="grid gap-2">
                {availableMethods.map(({ key, label }) => (
                  <button
                    key={key}
                    className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => handleSelectMethod(key)}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {METHOD_ICONS[key]}
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Payment details */}
        {step === "details" && selectedMethod && (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setStep("choose")}
            >
              <ArrowLeft className="h-3 w-3" />
              {t("back")}
            </Button>

            <div className="space-y-2">
              {selectedMethod === "cashapp" && (
                <>
                  <DetailRow
                    label={t("cashappTag")}
                    value={(paymentConfig?.cashapp_tag as string) || ""}
                    copyField="cashapp_tag"
                  />
                  <DetailRow
                    label={t("accountName")}
                    value={(paymentConfig?.cashapp_display_name as string) || ""}
                  />
                </>
              )}

              {selectedMethod === "zelle" && (
                <>
                  {paymentConfig?.zelle_email && (
                    <DetailRow
                      label={t("zelleEmail")}
                      value={paymentConfig.zelle_email as string}
                      copyField="zelle_email"
                    />
                  )}
                  {paymentConfig?.zelle_phone && (
                    <DetailRow
                      label={t("zellePhone")}
                      value={paymentConfig.zelle_phone as string}
                      copyField="zelle_phone"
                    />
                  )}
                  <DetailRow
                    label={t("accountName")}
                    value={(paymentConfig?.zelle_display_name as string) || ""}
                  />
                </>
              )}

              {selectedMethod === "mobile_money" && (
                <>
                  {Array.isArray(paymentConfig?.mobile_money_providers) &&
                    (paymentConfig.mobile_money_providers as MobileMoneyProvider[]).map((p, i) => (
                      <div key={i} className="space-y-2 rounded-lg border p-3">
                        <p className="text-xs font-medium text-primary">{p.provider}</p>
                        <DetailRow label={t("phoneNumber")} value={p.number} copyField={`momo_${i}`} />
                        {p.name && <DetailRow label={t("accountName")} value={p.name} />}
                      </div>
                    ))}
                </>
              )}

              {selectedMethod === "bank_transfer" && (
                <>
                  <DetailRow label={t("bankName")} value={(paymentConfig?.bank_name as string) || ""} />
                  <DetailRow label={t("accountName")} value={(paymentConfig?.bank_account_name as string) || ""} />
                  <DetailRow label={t("accountNumber")} value={(paymentConfig?.bank_account_number as string) || ""} copyField="bank_acct" />
                  {paymentConfig?.bank_routing_number && (
                    <DetailRow label={t("routingNumber")} value={paymentConfig.bank_routing_number as string} copyField="bank_routing" />
                  )}
                  {paymentConfig?.bank_swift_code && (
                    <DetailRow label={t("swiftCode")} value={paymentConfig.bank_swift_code as string} copyField="bank_swift" />
                  )}
                  {paymentConfig?.bank_branch && (
                    <DetailRow label={t("branch")} value={paymentConfig.bank_branch as string} />
                  )}
                </>
              )}
            </div>

            {/* Payment instructions */}
            {!!paymentConfig?.payment_instructions && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300">{t("instructions")}</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  {locale === "fr" && paymentConfig.payment_instructions_fr
                    ? String(paymentConfig.payment_instructions_fr)
                    : String(paymentConfig.payment_instructions)}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("includeReference")}</p>

            <Button className="w-full" onClick={handleIvePaid}>
              {t("ivePaid")}
            </Button>
          </div>
        )}

        {/* STEP 3: Confirmation form */}
        {step === "confirm" && (
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setStep("details")}
            >
              <ArrowLeft className="h-3 w-3" />
              {t("back")}
            </Button>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("referenceNumber")}</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t("referencePlaceholder")}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("screenshot")}</Label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    id="receipt-upload"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  />
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={() => document.getElementById("receipt-upload")?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {receiptFile ? receiptFile.name : t("uploadScreenshot")}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("notesLabel")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t("notesPlaceholder")}
                />
              </div>
            </div>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("submitForConfirmation")}
            </Button>
          </div>
        )}

        {/* STEP 4: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" />
            <p className="text-sm font-medium">{t("successMessage")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("successDetail")}</p>
            <Button className="mt-4" onClick={handleClose}>
              {t("done")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
