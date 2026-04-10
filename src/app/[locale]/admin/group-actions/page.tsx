"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import {
  ClipboardList,
  Info,
  Clock,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Calendar,
  UserPlus,
  FileText,
  Bell,
  Shield,
  Users,
  Banknote,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ActivityRow {
  id: string;
  group_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  message: string;
  message_fr: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  groups: { name: string } | null;
  memberships: { display_name: string | null; profiles: { full_name: string | null } | null } | null;
}

const PAGE_SIZE = 20;

const actionIcons: Record<string, typeof Shield> = {
  payment_made: CreditCard,
  event_created: Calendar,
  member_joined: UserPlus,
  minutes_published: FileText,
  announcement_posted: Bell,
  role_changed: Shield,
  member_removed: Users,
  contribution_recorded: Banknote,
  settings_updated: Settings,
};

const actionColors: Record<string, string> = {
  payment_made: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  event_created: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  member_joined: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  minutes_published: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  announcement_posted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  role_changed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  member_removed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  contribution_recorded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  settings_updated: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function GroupAdminActionsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { results, loading } = useAdminQuery([
    {
      key: "activities",
      table: "activity_feed",
      select: "id, group_id, action_type, entity_type, entity_id, message, message_fr, metadata, created_at, groups:group_id(name), memberships:actor_membership_id(display_name, profiles(full_name))",
      order: { column: "created_at", ascending: false },
      limit: 500,
    },
  ]);

  const activities = (results.activities?.data ?? []) as unknown as ActivityRow[];

  const actionTypes = useMemo(
    () => [...new Set(activities.map((a) => a.action_type))].sort(),
    [activities]
  );

  const groupNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of activities) {
      if (a.groups?.name && !map.has(a.group_id)) {
        map.set(a.group_id, a.groups.name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activities]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (actionFilter !== "all" && a.action_type !== actionFilter) return false;
      if (groupFilter !== "all" && a.group_id !== groupFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const msg = (locale === "fr" && a.message_fr ? a.message_fr : a.message).toLowerCase();
        const groupName = (a.groups?.name ?? "").toLowerCase();
        const actorName = (a.memberships?.profiles?.full_name ?? a.memberships?.display_name ?? "").toLowerCase();
        if (!msg.includes(q) && !groupName.includes(q) && !actorName.includes(q) && !a.action_type.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [activities, actionFilter, groupFilter, searchQuery, locale]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void) => (val: string | null) => {
    setter(val ?? "all");
    setPage(0);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString(dateLocale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getActorName = (a: ActivityRow) =>
    a.memberships?.profiles?.full_name ?? a.memberships?.display_name ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("groupAdminActions")}</h1>
        <p className="text-muted-foreground">{t("groupActionsSubtitle")}</p>
      </div>

      {/* Info banner */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300">{t("realTimeOversight")}</p>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("totalActions")}</p>
            <p className="text-2xl font-bold mt-1">{activities.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("uniqueGroups")}</p>
            <p className="text-2xl font-bold mt-1">{groupNames.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("actionTypes")}</p>
            <p className="text-2xl font-bold mt-1">{actionTypes.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchActions")}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs sr-only">{t("auditAction")}</Label>
          <Select value={actionFilter} onValueChange={handleFilterChange(setActionFilter)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder={t("allActions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allActions")}</SelectItem>
              {actionTypes.map((action) => (
                <SelectItem key={action} value={action}>
                  {action.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs sr-only">{t("groupLabel")}</Label>
          <Select value={groupFilter} onValueChange={handleFilterChange(setGroupFilter)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder={t("allGroups")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allGroups")}</SelectItem>
              {groupNames.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {pageItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mb-3 opacity-50" />
              <p className="font-medium">{t("noGroupActions")}</p>
              <p className="text-sm mt-1">{t("noGroupActionsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          pageItems.map((entry) => {
            const ActionIcon = actionIcons[entry.action_type] || ClipboardList;
            const color = actionColors[entry.action_type] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
            const actorName = getActorName(entry);
            const message = locale === "fr" && entry.message_fr ? entry.message_fr : entry.message;
            const isExpanded = expandedRow === entry.id;
            const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;

            return (
              <Card key={entry.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
                    <ActionIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      {actorName && (
                        <span className="text-sm font-medium">{actorName}</span>
                      )}
                      <Badge variant="outline" className="w-fit text-xs">
                        {entry.action_type.replace(/_/g, " ")}
                      </Badge>
                      {entry.groups?.name && (
                        <Badge variant="secondary" className="w-fit text-xs">
                          {entry.groups.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{message}</p>

                    {/* Expandable metadata */}
                    {hasMetadata && (
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1.5 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {t("viewDetails")}
                      </button>
                    )}
                    {isExpanded && entry.metadata && (
                      <pre className="mt-2 rounded-md bg-muted/50 p-3 text-xs font-mono overflow-x-auto max-h-40">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 pl-12 sm:pl-0">
                    <Clock className="h-3 w-3" />
                    {formatDate(entry.created_at)}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {t("showingRange", {
              from: page * PAGE_SIZE + 1,
              to: Math.min((page + 1) * PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
