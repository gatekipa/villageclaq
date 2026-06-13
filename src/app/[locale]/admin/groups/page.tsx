"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import {
  Search,
  Users,
  Ban,
  CheckCircle,
  Archive,
  ArrowUpDown,
  Building2,
  Loader2,
} from "lucide-react";

type GroupStatus = "active" | "suspended" | "archived";
type PlatformRole = "super_admin" | "admin" | "sales" | "support" | "finance";
type LifecycleAction = "suspend" | "activate" | "archive";
type GroupAction = LifecycleAction | "change_plan";

const SUBSCRIPTION_TIERS = ["free", "starter", "pro", "enterprise"] as const;
type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

interface AdminGroup {
  id: string;
  name: string;
  group_type: string | null;
  currency: string | null;
  is_active: boolean;
  created_at: string;
  memberCount: number;
}

const statusConfig: Record<GroupStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "statusActive" },
  suspended: { variant: "destructive", label: "statusSuspended" },
  archived: { variant: "secondary", label: "statusArchived" },
};

// Plan tier → translation key. The plan is the billing tier from
// group_subscriptions.tier — NOT groups.group_type (a community category like
// "njangi"/"village"), which is what this page previously mislabelled as the plan.
const tierLabelKey: Record<SubscriptionTier, string> = {
  free: "tierFree",
  starter: "tierStarter",
  pro: "tierPro",
  enterprise: "tierEnterprise",
};

// Map the dedicated group-action route's machine error codes to translation
// keys. Never render a raw enum token (FORBIDDEN, PLAN_UPDATE_FAILED, …) — that
// would surface untranslated English in both locales (Rule 1).
const ACTION_ERROR_KEY: Record<string, string> = {
  LIFECYCLE_UNAVAILABLE: "lifecyclePendingMigration",
  REASON_REQUIRED: "reasonRequiredError",
  FORBIDDEN: "actionForbidden",
  NOT_AUTHORIZED: "actionForbidden",
  INVALID_TIER: "actionInvalidTier",
};

export default function AdminGroupsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GroupStatus | "all">("all");
  const [role, setRole] = useState<PlatformRole | null>(null);

  // Action dialog state.
  const [dialogGroup, setDialogGroup] = useState<AdminGroup | null>(null);
  const [dialogAction, setDialogAction] = useState<GroupAction | null>(null);
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Resolve the caller's platform role. Drives which billing data we may read
  // (group_subscriptions read is gated to super_admin/admin) and which actions
  // are offered. The server re-enforces all of this on /api/admin/group-action.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: staff } = await supabase
        .from("platform_staff")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!cancelled && staff) setRole((staff as { role: PlatformRole }).role);
    })();
    return () => { cancelled = true; };
  }, []);

  const canReadSubs = role === "super_admin" || role === "admin";
  // memberships is readable by super_admin/admin/support but NOT sales/finance.
  const canReadMemberships = role === "super_admin" || role === "admin" || role === "support";
  const canManageLifecycle = role === "super_admin" || role === "admin";
  const canChangePlan = role === "super_admin" || role === "finance";

  // Only query a table when the role is allowed to read it — /api/admin/query
  // 403s the WHOLE batch if ANY query references a table forbidden for the role.
  // The base batch must therefore contain only tables every page-reaching role
  // can read (groups is readable by all of them); memberships and
  // group_subscriptions are added conditionally.
  const queries = useMemo(() => {
    const q: Parameters<typeof useAdminQuery>[0] = [
      {
        key: "groups",
        table: "groups",
        select: "id, name, group_type, currency, is_active, created_at",
        order: { column: "created_at", ascending: false },
      },
      // Soft probe for the 00103 lifecycle column. If groups.status is not yet
      // deployed this query returns a per-key error (NOT a 403), leaving the
      // rest of the page working and flagging lifecycle actions as unavailable.
      { key: "lifecycleProbe", table: "groups", select: "id, status" },
    ];
    if (canReadMemberships) {
      q.push({ key: "memberships", table: "memberships", select: "group_id" });
    }
    if (canReadSubs) {
      q.push({ key: "subscriptions", table: "group_subscriptions", select: "group_id, tier, status" });
    }
    return q;
  }, [canReadSubs, canReadMemberships]);

  const { results, loading, error: queryError, refetch } = useAdminQuery(queries);

  // groups.status is live only when the probe came back without a column error.
  const lifecycleReady = !!results.lifecycleProbe && !results.lifecycleProbe.error;

  const statusByGroup = useMemo(() => {
    const map: Record<string, GroupStatus> = {};
    if (!lifecycleReady) return map;
    for (const row of (results.lifecycleProbe?.data ?? []) as Array<{ id: string; status: string | null }>) {
      if (row.status === "active" || row.status === "suspended" || row.status === "archived") {
        map[row.id] = row.status;
      }
    }
    return map;
  }, [results.lifecycleProbe, lifecycleReady]);

  const tierByGroup = useMemo(() => {
    const map: Record<string, { tier: SubscriptionTier; status: string | null }> = {};
    for (const row of (results.subscriptions?.data ?? []) as Array<{ group_id: string; tier: string | null; status: string | null }>) {
      const tt = (row.tier ?? "free") as SubscriptionTier;
      map[row.group_id] = {
        tier: SUBSCRIPTION_TIERS.includes(tt) ? tt : "free",
        status: row.status ?? null,
      };
    }
    return map;
  }, [results.subscriptions]);

  const groups = useMemo<AdminGroup[]>(() => {
    const groupsData = (results.groups?.data ?? []) as Array<{
      id: string;
      name: string;
      group_type: string | null;
      currency: string | null;
      is_active: boolean;
      created_at: string;
    }>;
    const membershipsData = (results.memberships?.data ?? []) as Array<{
      group_id: string;
    }>;

    const countMap: Record<string, number> = {};
    for (const m of membershipsData) {
      countMap[m.group_id] = (countMap[m.group_id] || 0) + 1;
    }

    return groupsData.map((g) => ({
      id: g.id,
      name: g.name,
      group_type: g.group_type,
      currency: g.currency,
      is_active: g.is_active,
      created_at: g.created_at,
      memberCount: countMap[g.id] ?? 0,
    }));
  }, [results]);

  // Prefer the real lifecycle status; fall back to the is_active boolean until
  // the 00103 status column is deployed (active/suspended only — "archived"
  // cannot be represented by a boolean).
  function getGroupStatus(group: AdminGroup): GroupStatus {
    if (lifecycleReady && statusByGroup[group.id]) return statusByGroup[group.id];
    if (!group.is_active) return "suspended";
    return "active";
  }

  function planLabel(group: AdminGroup): string {
    if (!canReadSubs) return "--"; // billing tier not readable by this role
    const sub = tierByGroup[group.id];
    return t(tierLabelKey[sub?.tier ?? "free"]);
  }

  const filtered = groups.filter((g) => {
    const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase());
    const derivedStatus = getGroupStatus(g);
    const matchesStatus = statusFilter === "all" || derivedStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses: Array<GroupStatus | "all"> = ["all", "active", "suspended", "archived"];
  const statusLabels: Record<string, string> = {
    all: "allStatuses",
    active: "statusActive",
    suspended: "statusSuspended",
    archived: "statusArchived",
  };

  function openAction(group: AdminGroup, action: GroupAction) {
    setDialogGroup(group);
    setDialogAction(action);
    setReason("");
    setTier(tierByGroup[group.id]?.tier ?? "free");
    setActionError(null);
  }

  function closeDialog() {
    setDialogGroup(null);
    setDialogAction(null);
    setReason("");
    setActionError(null);
  }

  const reasonRequired = dialogAction === "suspend" || dialogAction === "archive";

  async function submitAction() {
    if (!dialogGroup || !dialogAction) return;
    if (reasonRequired && !reason.trim()) {
      setActionError(t("reasonRequiredError"));
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/group-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: dialogAction,
          groupId: dialogGroup.id,
          reason: reason.trim() || undefined,
          tier: dialogAction === "change_plan" ? tier : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = ACTION_ERROR_KEY[body.error as string] || "actionFailedGeneric";
        setActionError(t(key));
        return;
      }
      closeDialog();
      refetch();
    } catch {
      // Network/parse failure — never surface a raw Error.message to the user.
      setActionError(t("actionFailedGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  const showActionsColumn = canManageLifecycle || canChangePlan;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("groups")}</h1>
        <p className="text-muted-foreground">{t("groupsSubtitle")}</p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchGroups")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {t(statusLabels[s])}
            </Button>
          ))}
        </div>
      </div>

      {/* Lifecycle-pending notice — actions that need the 00103 status column. */}
      {canManageLifecycle && !loading && !lifecycleReady && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t("lifecyclePendingMigration")}
        </div>
      )}

      {/* Error state */}
      {queryError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">{queryError}</p>
        </div>
      )}

      {/* Group Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("noGroups")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((group) => {
            const derivedStatus = getGroupStatus(group);
            const status = statusConfig[derivedStatus];
            return (
              <Card key={group.id} className="transition-all hover:shadow-md">
                <CardContent className="p-4 space-y-3">
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.group_type ?? "--"}</p>
                    </div>
                    <Badge variant={status.variant} className="shrink-0">
                      {t(status.label)}
                    </Badge>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">{t("planTier")}</p>
                      <p className="font-medium">{planLabel(group)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("memberCount")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {canReadMemberships ? group.memberCount : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("createdDate")}</p>
                      <p className="font-medium">{new Date(group.created_at).toLocaleDateString(getDateLocale(locale), { year: "numeric", month: "short", day: "numeric" })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("collectionRate")}</p>
                      <p className="font-medium text-muted-foreground">--</p>
                    </div>
                  </div>

                  {/* Actions — only rendered for roles that can actually perform
                      them; the server re-checks on every call. */}
                  {showActionsColumn && derivedStatus !== "archived" && (
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      {canManageLifecycle && derivedStatus === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={!lifecycleReady}
                          title={!lifecycleReady ? t("lifecyclePendingMigration") : undefined}
                          onClick={() => openAction(group, "suspend")}
                        >
                          <Ban className="mr-1.5 h-3 w-3" />
                          {t("suspendGroup")}
                        </Button>
                      )}
                      {canManageLifecycle && derivedStatus === "suspended" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={!lifecycleReady}
                          title={!lifecycleReady ? t("lifecyclePendingMigration") : undefined}
                          onClick={() => openAction(group, "activate")}
                        >
                          <CheckCircle className="mr-1.5 h-3 w-3" />
                          {t("activateGroup")}
                        </Button>
                      )}
                      {canChangePlan && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => openAction(group, "change_plan")}
                        >
                          <ArrowUpDown className="mr-1.5 h-3 w-3" />
                          {t("changePlan")}
                        </Button>
                      )}
                      {canManageLifecycle && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          disabled={!lifecycleReady}
                          title={!lifecycleReady ? t("lifecyclePendingMigration") : undefined}
                          onClick={() => openAction(group, "archive")}
                        >
                          <Archive className="mr-1.5 h-3 w-3" />
                          {t("archiveGroup")}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Action dialog — confirmation + reason capture for Suspend/Archive/
          Activate, tier select for Change Plan. */}
      <Dialog open={!!dialogGroup} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          {dialogGroup && dialogAction && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialogAction === "suspend" && t("suspendGroup")}
                  {dialogAction === "activate" && t("activateGroup")}
                  {dialogAction === "archive" && t("archiveGroup")}
                  {dialogAction === "change_plan" && t("changePlan")}
                </DialogTitle>
                <DialogDescription>
                  {dialogAction === "suspend" && t("suspendGroupConfirm", { name: dialogGroup.name })}
                  {dialogAction === "activate" && t("activateGroupConfirm", { name: dialogGroup.name })}
                  {dialogAction === "archive" && t("archiveGroupConfirm", { name: dialogGroup.name })}
                  {dialogAction === "change_plan" && t("changePlanConfirm", { name: dialogGroup.name })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {dialogAction === "change_plan" && (
                  <div className="space-y-1.5">
                    <Label>{t("planTier")}</Label>
                    <Select value={tier} onValueChange={(v) => setTier(v as SubscriptionTier)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBSCRIPTION_TIERS.map((tt) => (
                          <SelectItem key={tt} value={tt}>
                            {t(tierLabelKey[tt])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>
                    {reasonRequired ? t("reasonRequired") : t("reasonOptional")}
                  </Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("reasonPlaceholder")}
                    rows={3}
                  />
                </div>

                {actionError && (
                  <p className="text-sm font-medium text-destructive">{actionError}</p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={submitting}>
                  {t("cancel")}
                </Button>
                <Button
                  variant={dialogAction === "archive" || dialogAction === "suspend" ? "destructive" : "default"}
                  onClick={submitAction}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
