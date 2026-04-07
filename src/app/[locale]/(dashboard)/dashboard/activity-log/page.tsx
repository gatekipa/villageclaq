"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";
import { exportCSV } from "@/lib/export";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScrollText,
  Search,
  Users,
  CreditCard,
  Calendar,
  Settings,
  Megaphone,
  Gavel,
  Landmark,
  Heart,
  Scale,
  Activity,
  Clock,
  ChevronDown,
  Download,
  X,
  Loader2,
} from "lucide-react";
import { RequirePermission } from "@/components/ui/permission-gate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import type { LucideIcon } from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  group_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_member: Record<string, unknown> | null;
}

const ENTITY_TYPE_ICONS: Record<string, LucideIcon> = {
  membership: Users,
  payment: CreditCard,
  event: Calendar,
  fine: Gavel,
  loan: Landmark,
  relief: Heart,
  dispute: Scale,
  announcement: Megaphone,
  settings: Settings,
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  membership: "text-blue-500",
  payment: "text-emerald-500",
  event: "text-purple-500",
  fine: "text-red-500",
  loan: "text-amber-500",
  relief: "text-pink-500",
  dispute: "text-orange-500",
  announcement: "text-indigo-500",
  settings: "text-slate-500",
};

const ACTION_BADGE_COLORS: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  recorded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  issued: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  waived: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  invited: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  sent: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  filed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  joined: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  removed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  changed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  disbursed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  published: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  denied: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function getActionBadgeColor(action: string): string {
  const verb = action.split(".")[1] || action;
  return ACTION_BADGE_COLORS[verb] || "bg-muted text-muted-foreground";
}

// ─── CATEGORY FILTERS ────────────────────────────────────────────────────────

const CATEGORY_FILTERS = [
  { key: "all", entityTypes: [] },
  { key: "member", entityTypes: ["membership"] },
  { key: "financial", entityTypes: ["payment", "fine", "loan"] },
  { key: "event", entityTypes: ["event"] },
  { key: "relief", entityTypes: ["relief"] },
  { key: "settings", entityTypes: ["settings", "announcement"] },
  { key: "dispute", entityTypes: ["dispute"] },
] as const;

// ─── HOOK ────────────────────────────────────────────────────────────────────

function useAuditLogs(category: string, searchQuery: string, dateFrom: string, dateTo: string) {
  const { groupId } = useGroup();
  return useQuery<AuditEntry[]>({
    queryKey: ["audit-logs", groupId, category, searchQuery, dateFrom, dateTo],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      let query = supabase
        .from("group_audit_logs")
        .select("*, actor_member:memberships!left(id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(500);

      // Category filter
      const catFilter = CATEGORY_FILTERS.find((c) => c.key === category);
      if (catFilter && catFilter.entityTypes.length > 0) {
        query = query.in("entity_type", catFilter.entityTypes as unknown as string[]);
      }

      // Text search in description
      if (searchQuery.trim()) {
        query = query.ilike("description", `%${searchQuery.trim()}%`);
      }

      // Date range filter
      if (dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("[ActivityLog] Query failed:", error.message);
        return [];
      }
      return (data || []) as AuditEntry[];
    },
    enabled: !!groupId,
    staleTime: 30_000,
  });
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
  const t = useTranslations("activityLog");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { currentGroup } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const dateLocale = locale === "fr" ? "fr-FR" : "en-US";

  const [category, setCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: logs, isLoading, isError, error, refetch } = useAuditLogs(category, searchQuery, dateFrom, dateTo);

  const formatTimestamp = (d: string) => {
    try {
      const date = new Date(d);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return t("justNow");
      if (diffMins < 60) return t("minutesAgo", { count: diffMins });
      if (diffHours < 24) return t("hoursAgo", { count: diffHours });
      if (diffDays < 7) return t("daysAgo", { count: diffDays });
      return formatDateWithGroupFormat(date, groupDateFormat, locale);
    } catch {
      return d;
    }
  };

  const getActorName = (entry: AuditEntry): string => {
    // actor_member is joined via memberships → may be array or object
    const member = Array.isArray(entry.actor_member) ? entry.actor_member[0] : entry.actor_member;
    if (member) return getMemberName(member as Record<string, unknown>);
    return t("system");
  };

  const handleExportCSV = () => {
    const entries = logs || [];
    if (entries.length === 0) return;
    setExporting(true);
    try {
      const rows = entries.map((entry) => ({
        Date: new Date(entry.created_at).toLocaleString(dateLocale),
        Actor: getActorName(entry),
        Action: entry.action,
        Category: entry.entity_type || "",
        Description: entry.description || "",
      }));
      const groupName = currentGroup?.name || "group";
      exportCSV(rows, `activity-log_${groupName.replace(/\s+/g, "-")}`, {
        headerRows: [
          `${groupName} - ${t("title")}`,
          `${tc("exported")}: ${new Date().toLocaleString(dateLocale)}`,
          ...(dateFrom || dateTo ? [`${t("dateRange")}: ${dateFrom || "..."} → ${dateTo || "..."}`] : []),
        ],
      });
    } finally {
      setExporting(false);
    }
  };

  const hasDateFilter = dateFrom || dateTo;
  const clearDateFilter = () => {
    setDateFrom("");
    setDateTo("");
    setVisibleCount(50);
  };

  if (isLoading) return <ListSkeleton rows={8} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const entries = logs || [];
  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = entries.length > visibleCount;

  return (
    <RequirePermission anyOf={["settings.manage"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || entries.length === 0}
            className="shrink-0"
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t("exportCsv")}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(50); }}
              className="pl-10"
            />
          </div>
          <Select value={category} onValueChange={(v) => { if (v) setCategory(v); setVisibleCount(50); }}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_FILTERS.map((f) => (
                <SelectItem key={f.key} value={f.key}>{t(`filter_${f.key}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 flex-1">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setVisibleCount(50); }}
              className="w-full sm:w-[180px]"
              placeholder={t("dateFrom")}
            />
            <span className="text-sm text-muted-foreground">→</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setVisibleCount(50); }}
              className="w-full sm:w-[180px]"
              placeholder={t("dateTo")}
            />
          </div>
          {hasDateFilter && (
            <Button variant="ghost" size="sm" onClick={clearDateFilter}>
              <X className="mr-1 h-3 w-3" />
              {t("clearDates")}
            </Button>
          )}
        </div>

        {/* Result count */}
        {entries.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("showingEntries", { count: entries.length })}
          </p>
        )}

        {/* Entries */}
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={t("noLogs")}
            description={t("noLogsDesc")}
          />
        ) : (
          <div className="space-y-2">
            {visibleEntries.map((entry) => {
              const entityType = entry.entity_type || "settings";
              const Icon = ENTITY_TYPE_ICONS[entityType] || Activity;
              const iconColor = ENTITY_TYPE_COLORS[entityType] || "text-muted-foreground";

              return (
                <Card key={entry.id}>
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted ${iconColor}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{getActorName(entry)}</span>
                            <Badge variant="secondary" className={`text-xs ${getActionBadgeColor(entry.action)}`}>
                              {t.has(`action_${entry.action.replace(/\./g, "_")}`) ? t(`action_${entry.action.replace(/\./g, "_")}`) : entry.action}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimestamp(entry.created_at)}</span>
                          </div>
                        </div>
                        {entry.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setVisibleCount((c) => c + 50)}>
              <ChevronDown className="mr-2 h-4 w-4" />
              {t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
