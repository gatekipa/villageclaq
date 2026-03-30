"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScrollText,
  Download,
  Filter,
  Calendar,
  User,
  Clock,
} from "lucide-react";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

interface AuditActor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface AuditLogEntry {
  id: string;
  group_id: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: AuditActor | null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(dateStr: string, locale: string = "en"): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (seconds < 60) return rtf.format(-seconds, "second");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return rtf.format(-minutes, "minute");
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return rtf.format(-hours, "hour");
    const days = Math.floor(hours / 24);
    if (days < 7) return rtf.format(-days, "day");
  } catch {
    // Fallback if Intl not supported
  }
  return date.toLocaleDateString(locale);
}

const actionColors: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  invite: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  approve: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function getActionColor(action: string): string {
  const key = Object.keys(actionColors).find((k) => action.toLowerCase().includes(k));
  return key ? actionColors[key] : "bg-muted text-muted-foreground";
}

export default function AuditLogPage() {
  const t = useTranslations("auditLog");
  const locale = useLocale();
  const { groupId } = useGroup();
  const [actionFilter, setActionFilter] = useState<string>("all");

  const supabase = createClient();

  const { data: logs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit-logs", groupId, actionFilter],
    queryFn: async () => {
      if (!groupId) return [];

      let query = supabase
        .from("group_audit_logs")
        .select("*, actor:profiles!group_audit_logs_actor_id_fkey(id, full_name, avatar_url)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (actionFilter !== "all") {
        query = query.ilike("action", `%${actionFilter}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLogEntry[];
    },
    enabled: !!groupId,
  });

  if (isLoading) {
    return <ListSkeleton rows={6} />;
  }

  if (isError) {
    return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;
  }

  const entries = logs || [];

  // Extract unique action types for filter
  const uniqueActions = Array.from(new Set(entries.map((e) => e.action)));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="self-start sm:self-auto">
          <Download className="mr-2 h-4 w-4" />
          {t("exportCsv")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {t("filterAction")}
            </span>
          </div>
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v || "all")}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAction")}</SelectItem>
              {uniqueActions.map((action) => (
                <SelectItem key={action} value={action}>
                  {action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Audit Log Entries */}
      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={t("noLogs")}
          description={t("noLogsDesc")}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4" />
              {t("title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-4 sm:items-center"
                >
                  {/* Actor Avatar */}
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={entry.actor?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {entry.actor?.full_name
                        ? getInitials(entry.actor.full_name)
                        : <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>

                  {/* Entry Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {entry.actor?.full_name || t("actor")}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${getActionColor(entry.action)}`}
                      >
                        {entry.action}
                      </Badge>
                    </div>
                    {entry.details && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {JSON.stringify(entry.details).slice(0, 120)}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    <span>{timeAgo(entry.created_at, locale)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
