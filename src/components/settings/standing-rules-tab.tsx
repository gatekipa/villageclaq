"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck, Loader2, Save, Eye } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useGroupSettings } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/hooks/use-permissions";

type StandingRules = {
  enabled: boolean;
  attendance_threshold_percent: number;
  missed_hosting_threshold: number;
  overdue_grace_days: number;
  attendance_lookback_months: number;
};

type PreviewResult = {
  total_members: number;
  would_become_good: number;
  would_become_warning: number;
  would_become_suspended: number;
  would_change: number;
};

const DEFAULT_RULES: StandingRules = {
  enabled: true,
  attendance_threshold_percent: 60,
  missed_hosting_threshold: 2,
  overdue_grace_days: 0,
  attendance_lookback_months: 12,
};

export function StandingRulesTab() {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();
  const { groupId } = useGroup();
  const { hasPermission } = usePermissions();
  const canManageSettings = hasPermission("settings.manage");
  const { data: group } = useGroupSettings();

  const [rules, setRules] = useState<StandingRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  // Seed state from group.settings.standing_rules whenever group loads.
  useEffect(() => {
    if (!group) return;
    const g = group as Record<string, unknown>;
    const settings = (g.settings as Record<string, unknown>) || {};
    const stored = (settings.standing_rules as Partial<StandingRules>) || {};
    setRules({
      enabled: stored.enabled ?? DEFAULT_RULES.enabled,
      attendance_threshold_percent:
        Number(stored.attendance_threshold_percent ?? DEFAULT_RULES.attendance_threshold_percent),
      missed_hosting_threshold:
        Number(stored.missed_hosting_threshold ?? DEFAULT_RULES.missed_hosting_threshold),
      overdue_grace_days:
        Number(stored.overdue_grace_days ?? DEFAULT_RULES.overdue_grace_days),
      attendance_lookback_months:
        Number(stored.attendance_lookback_months ?? DEFAULT_RULES.attendance_lookback_months),
    });
  }, [group]);

  function clampInt(n: number, min: number, max: number) {
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  async function handlePreview() {
    if (!groupId || previewing) return;
    setPreviewing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("preview_standing_changes", {
        p_group_id: groupId,
        p_new_rules: rules,
      });
      if (rpcErr) throw rpcErr;
      setPreview(data as PreviewResult);
      setShowPreview(true);
    } catch (e) {
      setError((e as Error).message || t("standingPreviewError"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!groupId || applying) return;
    setApplying(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("apply_standing_rules", {
        p_group_id: groupId,
        p_rules: rules,
      });
      if (rpcErr) throw rpcErr;
      const result = (data as { changed: number; rules: StandingRules }) || { changed: 0, rules };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["group-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["members", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["member-standing"] }),
      ]);
      setSuccessMsg(
        result.changed === 0
          ? t("standingAppliedNoChange")
          : t("standingApplied", { changed: result.changed })
      );
      setShowPreview(false);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message || t("standingError"));
    } finally {
      setApplying(false);
    }
  }

  const disabled = !canManageSettings || loading || applying || previewing;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {t("standingTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t("standingDesc")}</p>

          {/* Enable toggle */}
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{t("standingEnableAuto")}</Label>
              <p className="text-xs text-muted-foreground">{t("standingEnableAutoDesc")}</p>
            </div>
            <Switch
              checked={rules.enabled}
              onCheckedChange={(v: boolean) =>
                setRules((r) => ({ ...r, enabled: v }))
              }
              disabled={disabled}
            />
          </div>

          {/* Attendance threshold */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm font-medium">{t("standingAttendanceThreshold")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={rules.attendance_threshold_percent}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    attendance_threshold_percent: clampInt(Number(e.target.value), 0, 100),
                  }))
                }
                className="max-w-[100px]"
                disabled={disabled || !rules.enabled}
              />
              <span className="text-sm text-muted-foreground">{t("standingPercent")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("standingAttendanceThresholdDesc")}</p>
          </div>

          {/* Missed hosting threshold */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm font-medium">{t("standingMissedHosting")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={50}
                value={rules.missed_hosting_threshold}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    missed_hosting_threshold: clampInt(Number(e.target.value), 0, 50),
                  }))
                }
                className="max-w-[100px]"
                disabled={disabled || !rules.enabled}
              />
              <span className="text-sm text-muted-foreground">{t("standingUnitTurns")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("standingMissedHostingDesc")}</p>
          </div>

          {/* Grace days */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm font-medium">{t("standingGraceDays")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={365}
                value={rules.overdue_grace_days}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    overdue_grace_days: clampInt(Number(e.target.value), 0, 365),
                  }))
                }
                className="max-w-[100px]"
                disabled={disabled || !rules.enabled}
              />
              <span className="text-sm text-muted-foreground">{t("standingUnitDays")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("standingGraceDaysDesc")}</p>
          </div>

          {/* Lookback months */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm font-medium">{t("standingLookback")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={60}
                value={rules.attendance_lookback_months}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    attendance_lookback_months: clampInt(Number(e.target.value), 1, 60),
                  }))
                }
                className="max-w-[100px]"
                disabled={disabled || !rules.enabled}
              />
              <span className="text-sm text-muted-foreground">{t("standingUnitMonths")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("standingLookbackDesc")}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {successMsg && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{successMsg}</p>
          )}

          {canManageSettings && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePreview} disabled={disabled} variant="outline">
                {previewing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                {t("standingPreviewBtn")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview confirmation dialog */}
      <Dialog open={showPreview} onOpenChange={(o) => !applying && setShowPreview(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {t("standingPreviewTitle")}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 py-2">
              {preview.would_change === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("standingPreviewNoChange")}
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {t("standingPreviewSummary", {
                      changed: preview.would_change,
                      total: preview.total_members,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("standingPreviewBreakdown", {
                      good: preview.would_become_good,
                      warning: preview.would_become_warning,
                      suspended: preview.would_become_suspended,
                    })}
                  </p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPreview(false)}
              disabled={applying}
            >
              {t("standingPreviewCancel")}
            </Button>
            <Button onClick={handleApply} disabled={applying}>
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("standingPreviewConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
