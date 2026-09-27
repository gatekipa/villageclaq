"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useContributionTypes, useGroupSettings } from "@/lib/hooks/use-supabase-query";
import {
  paymentReminderSettingsFromGroup,
  type PaymentReminderMode,
} from "@/lib/payment-reminder-eligibility";

export function PaymentReminderSettingsTab() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { groupId } = useGroup();
  const { hasPermission } = usePermissions();
  const { data: group } = useGroupSettings();
  const { data: contributionTypes = [] } = useContributionTypes();
  const [mode, setMode] = useState<PaymentReminderMode>("due_date_only");
  const [timezone, setTimezone] = useState("UTC");
  const [stoppedTypeIds, setStoppedTypeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!group) return;
    const settings = paymentReminderSettingsFromGroup((group as Record<string, unknown>).settings as Record<string, unknown> | null);
    setMode(settings.mode);
    setTimezone(settings.timezone);
    setStoppedTypeIds(settings.stoppedContributionTypeIds);
  }, [group]);

  function toggleType(id: string, stopped: boolean) {
    setStoppedTypeIds((current) => stopped
      ? Array.from(new Set([...current, id]))
      : current.filter((item) => item !== id));
  }

  async function save() {
    if (!groupId || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.rpc("update_payment_reminder_settings", {
        p_command: {
          group_id: groupId,
          mode,
          timezone: timezone.trim(),
          stopped_contribution_type_ids: stoppedTypeIds,
        },
      });
      if (saveError) throw saveError;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["group-settings"] }),
      ]);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("reminderSaveError"));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !hasPermission("settings.manage") || saving;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" />
          {t("reminderTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">{t("reminderDescription")}</p>

        <div className="space-y-2">
          <Label htmlFor="payment-reminder-mode">{t("reminderMode")}</Label>
          <select
            id="payment-reminder-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as PaymentReminderMode)}
            disabled={disabled}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="due_date_only">{t("reminderModeDueDate")}</option>
            <option value="overdue_daily">{t("reminderModeOverdue")}</option>
            <option value="stopped">{t("reminderModeStopped")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t(`reminderModeHelp_${mode}`)}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="payment-reminder-timezone">{t("reminderTimezone")}</Label>
          <Input
            id="payment-reminder-timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Africa/Douala"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">{t("reminderTimezoneHelp")}</p>
        </div>

        <div className="space-y-3">
          <div>
            <Label>{t("reminderStoppedTypes")}</Label>
            <p className="text-xs text-muted-foreground">{t("reminderStoppedTypesHelp")}</p>
          </div>
          {contributionTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reminderNoContributionTypes")}</p>
          ) : contributionTypes.map((type) => {
            const stopped = stoppedTypeIds.includes(type.id as string);
            const name = locale === "fr" && type.name_fr ? type.name_fr : type.name;
            return (
              <label key={type.id as string} className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                <span>{name as string}</span>
                <input
                  type="checkbox"
                  checked={stopped}
                  onChange={(event) => toggleType(type.id as string, event.target.checked)}
                  disabled={disabled}
                  aria-label={t("reminderStopTypeLabel", { name: name as string })}
                  className="h-4 w-4 rounded border-input"
                />
              </label>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">{t("reminderObligationSafety")}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t("reminderSaved")}</p>}
        <Button onClick={save} disabled={disabled || !timezone.trim()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("reminderSave")}
        </Button>
      </CardContent>
    </Card>
  );
}
