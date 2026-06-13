"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
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
import { calculateStanding } from "@/lib/calculate-standing";
import { useGroup } from "@/lib/group-context";
import { useGroupSettings, useContributionTypes } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  resolveStandingRules,
  serializeStandingRules,
  STANDING_FACTOR_KEYS,
  type StandingRules,
  type StandingFactorKey,
} from "@/lib/standing-rules";

type PreviewResult = {
  total_members: number;
  would_become_good: number;
  would_become_warning: number;
  would_become_suspended: number;
  would_change: number;
  /** Members whose projection could not be computed (excluded from the counts). */
  failed: number;
};

/**
 * Which numeric threshold (if any) belongs under each factor. Used to group
 * the threshold input visually beneath its factor and to grey it out when
 * the factor is switched off.
 */
const FACTOR_THRESHOLD: Partial<Record<StandingFactorKey, "attendance" | "hosting">> = {
  // Meeting + event attendance share one threshold + lookback; render the
  // editor once, under meeting attendance.
  meetingAttendance: "attendance",
  hosting: "hosting",
};

export function StandingRulesTab() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { groupId } = useGroup();
  const { hasPermission } = usePermissions();
  const canManageSettings = hasPermission("settings.manage");
  const { data: group } = useGroupSettings();
  const { data: contributionTypes } = useContributionTypes();

  const [rules, setRules] = useState<StandingRules>(() =>
    resolveStandingRules(undefined)
  );
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  // Seed the FULL rules (thresholds + factors + exclusions) from
  // group.settings whenever the group loads. resolveStandingRules defaults
  // and clamps, so partial/legacy JSONB is handled safely.
  useEffect(() => {
    if (!group) return;
    const g = group as Record<string, unknown>;
    setRules(resolveStandingRules(g.settings));
  }, [group]);

  function clampInt(n: number, min: number, max: number) {
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function setFactor(key: StandingFactorKey, value: boolean) {
    setRules((r) => ({ ...r, factors: { ...r.factors, [key]: value } }));
  }

  function toggleExcluded(typeId: string, excluded: boolean) {
    setRules((r) => {
      const set = new Set(r.excludedContributionTypeIds);
      if (excluded) set.add(typeId);
      else set.delete(typeId);
      return { ...r, excludedContributionTypeIds: Array.from(set) };
    });
  }

  async function handlePreview() {
    if (!groupId || previewing) return;
    setPreviewing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();
      // Project the CANDIDATE (not-yet-saved) rules with the SAME engine the
      // member/admin displays use (rulesOverride, updateDb:false). This keeps
      // the preview accurate even before the server engine is brought to
      // parity — the previous server preview ignored the factor toggles.
      const { data: members, error: mErr } = await supabase
        .from("memberships")
        .select("id, standing")
        .eq("group_id", groupId)
        .eq("is_proxy", false)
        .in("membership_status", ["active", "pending_approval"]);
      if (mErr) throw mErr;

      const projected = (
        await Promise.all(
          (members || []).map((m) =>
            calculateStanding(m.id as string, groupId, {
              updateDb: false,
              rulesOverride: rules,
            })
              .then((res) => ({ current: m.standing as string, next: res.standing as string }))
              .catch(() => null),
          ),
        )
      ).filter((p): p is { current: string; next: string } => p !== null);

      const result: PreviewResult = {
        total_members: projected.length,
        would_become_good: projected.filter((p) => p.next === "good").length,
        would_become_warning: projected.filter((p) => p.next === "warning").length,
        would_become_suspended: projected.filter((p) => p.next === "suspended").length,
        would_change: projected.filter((p) => p.next !== p.current).length,
        failed: (members || []).length - projected.length,
      };
      setPreview(result);
      setShowPreview(true);
    } catch {
      setError(t("standingPreviewError"));
    } finally {
      setPreviewing(false);
    }
  }

  // Save writes the FULL serialized rules directly to groups.settings —
  // the apply_standing_rules RPC normalizes away unknown keys and would drop
  // the factor toggles and exclusion list, so we merge + update here instead.
  // Admins can update their own group's row under RLS.
  //
  // The read-merge-write below is last-write-wins on the whole settings blob.
  // The read happens immediately before the write to keep the window tiny.
  // Once migration 00101 is applied, switch this to the apply_standing_rules
  // RPC, which merges only the standing_rules key server-side (atomic, no
  // cross-tab clobber) AND recalculates persisted standing in one call.
  async function handleApply() {
    if (!groupId || applying) return;
    setApplying(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();

      // Read the current settings so we only replace the standing_rules key.
      const { data: current, error: readErr } = await supabase
        .from("groups")
        .select("settings")
        .eq("id", groupId)
        .single();
      if (readErr) throw readErr;

      const existingSettings =
        (current?.settings as Record<string, unknown> | null) ?? {};
      const nextSettings = {
        ...existingSettings,
        standing_rules: serializeStandingRules(rules),
      };

      const { error: updateErr } = await supabase
        .from("groups")
        .update({ settings: nextSettings })
        .eq("id", groupId);
      if (updateErr) throw updateErr;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["group-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["members", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["member-standing"] }),
      ]);

      setSuccessMsg(t("standingSavedImmediate"));
      setShowPreview(false);
      setPreview(null);
    } catch {
      setError(t("standingError"));
    } finally {
      setApplying(false);
    }
  }

  const disabled = !canManageSettings || loading || applying || previewing;
  const types = contributionTypes ?? [];

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

          {/* ── What affects standing ─────────────────────────────────── */}
          <div className="space-y-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">{t("standingFactorsTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("standingFactorsDesc")}</p>
            </div>

            {STANDING_FACTOR_KEYS.map((key) => {
              const factorOn = rules.factors[key];
              const threshold = FACTOR_THRESHOLD[key];
              return (
                <div key={key} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t(`standingFactor_${key}`)}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t(`standingFactor_${key}_desc`)}
                      </p>
                    </div>
                    <Switch
                      checked={factorOn}
                      onCheckedChange={(v: boolean) => setFactor(key, v)}
                      disabled={disabled || !rules.enabled}
                      aria-label={t(`standingFactor_${key}`)}
                    />
                  </div>

                  {/* Attendance threshold + lookback — shared by meeting AND
                      event attendance; editable when either is on. */}
                  {threshold === "attendance" && (() => {
                    const attendanceActive =
                      rules.factors.meetingAttendance || rules.factors.eventAttendance;
                    return (
                    <div
                      className={`grid gap-3 border-t pt-3 sm:grid-cols-2 ${
                        !attendanceActive ? "opacity-50" : ""
                      }`}
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          {t("standingAttendanceThreshold")}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={rules.attendanceThresholdPercent}
                            onChange={(e) =>
                              setRules((r) => ({
                                ...r,
                                attendanceThresholdPercent: clampInt(
                                  Number(e.target.value),
                                  0,
                                  100
                                ),
                              }))
                            }
                            className="max-w-[100px]"
                            disabled={disabled || !rules.enabled || !attendanceActive}
                          />
                          <span className="text-sm text-muted-foreground">
                            {t("standingPercent")}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          {t("standingLookback")}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            value={rules.attendanceLookbackMonths}
                            onChange={(e) =>
                              setRules((r) => ({
                                ...r,
                                attendanceLookbackMonths: clampInt(
                                  Number(e.target.value),
                                  1,
                                  60
                                ),
                              }))
                            }
                            className="max-w-[100px]"
                            disabled={disabled || !rules.enabled || !attendanceActive}
                          />
                          <span className="text-sm text-muted-foreground">
                            {t("standingUnitMonths")}
                          </span>
                        </div>
                      </div>
                    </div>
                    );
                  })()}

                  {/* Hosting factor → missed-turns threshold */}
                  {threshold === "hosting" && (
                    <div
                      className={`space-y-1.5 border-t pt-3 ${
                        !factorOn ? "opacity-50" : ""
                      }`}
                    >
                      <Label className="text-xs font-medium">
                        {t("standingMissedHosting")}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={rules.missedHostingThreshold}
                          onChange={(e) =>
                            setRules((r) => ({
                              ...r,
                              missedHostingThreshold: clampInt(
                                Number(e.target.value),
                                0,
                                50
                              ),
                            }))
                          }
                          className="max-w-[100px]"
                          disabled={disabled || !rules.enabled || !factorOn}
                        />
                        <span className="text-sm text-muted-foreground">
                          {t("standingUnitTurns")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Dues factor → grace-period days */}
                  {key === "dues" && (
                    <div
                      className={`space-y-1.5 border-t pt-3 ${
                        !factorOn ? "opacity-50" : ""
                      }`}
                    >
                      <Label className="text-xs font-medium">
                        {t("standingGraceDays")}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={rules.overdueGraceDays}
                          onChange={(e) =>
                            setRules((r) => ({
                              ...r,
                              overdueGraceDays: clampInt(
                                Number(e.target.value),
                                0,
                                365
                              ),
                            }))
                          }
                          className="max-w-[100px]"
                          disabled={disabled || !rules.enabled || !factorOn}
                        />
                        <span className="text-sm text-muted-foreground">
                          {t("standingUnitDays")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Contributions that don't affect standing ──────────────── */}
          <div className="space-y-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">{t("standingExclusionsTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("standingExclusionsDesc")}</p>
            </div>

            <div
              className={`space-y-2 rounded-lg border p-3 ${
                !rules.factors.dues ? "opacity-50" : ""
              }`}
            >
              {!rules.factors.dues && (
                <p className="text-xs text-muted-foreground">
                  {t("standingExclusionsDuesOff")}
                </p>
              )}
              {types.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("standingExclusionsEmpty")}
                </p>
              ) : (
                types.map((type) => {
                  const ct = type as Record<string, unknown>;
                  const id = ct.id as string;
                  const name =
                    locale === "fr" && ct.name_fr
                      ? (ct.name_fr as string)
                      : (ct.name as string);
                  // Switch ON = "affects standing" (the common case);
                  // toggling OFF adds the type to the exclusion list.
                  const affects = !rules.excludedContributionTypeIds.includes(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-4 py-1"
                    >
                      <Label
                        htmlFor={`exclude-${id}`}
                        className="text-sm font-normal"
                      >
                        {name}
                      </Label>
                      <Switch
                        id={`exclude-${id}`}
                        checked={affects}
                        onCheckedChange={(v: boolean) => toggleExcluded(id, !v)}
                        disabled={disabled || !rules.enabled || !rules.factors.dues}
                        aria-label={name}
                      />
                    </div>
                  );
                })
              )}
            </div>
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

      {/* Preview + confirm-save dialog */}
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
              {preview.failed > 0 && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {t("standingPreviewPartial", { count: preview.failed })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("standingApplyImmediateNote")}
              </p>
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
              {t("standingSaveBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
