"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { useNotifications } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/routing";
import { getNotificationLink } from "@/lib/notify-client";
import {
  Bell,
  Check,
  CheckCheck,
  Calendar,
  HandCoins,
  Megaphone,
  Heart,
  Users,
  FileText,
} from "lucide-react";

type NotificationType =
  | "payment"
  | "event"
  | "announcement"
  | "relief"
  | "minutes"
  | "member";

const TYPE_ICONS: Record<string, React.ElementType> = {
  event: Calendar,
  payment: HandCoins,
  announcement: Megaphone,
  relief: Heart,
  minutes: FileText,
  member: Users,
};

const TYPE_COLORS: Record<string, string> = {
  event: "text-blue-500 dark:text-blue-400",
  payment: "text-amber-500 dark:text-amber-400",
  announcement: "text-purple-500 dark:text-purple-400",
  relief: "text-rose-500 dark:text-rose-400",
  minutes: "text-slate-500 dark:text-slate-400",
  member: "text-emerald-500 dark:text-emerald-400",
};

const TYPE_BG: Record<string, string> = {
  event: "bg-blue-50 dark:bg-blue-950/40",
  payment: "bg-amber-50 dark:bg-amber-950/40",
  announcement: "bg-purple-50 dark:bg-purple-950/40",
  relief: "bg-rose-50 dark:bg-rose-950/40",
  minutes: "bg-slate-50 dark:bg-slate-950/40",
  member: "bg-emerald-50 dark:bg-emerald-950/40",
};

function getRelativeTime(
  timestamp: Date,
  now: Date,
  t: (key: string, values?: Record<string, string | number>) => string,
  locale: string = "en"
): string {
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return t("timeAgo.justNow");
  if (diffMinutes < 60)
    return t("timeAgo.minutesAgo", { count: diffMinutes });
  if (diffHours < 24) return t("timeAgo.hoursAgo", { count: diffHours });
  if (diffDays === 1) return t("timeAgo.yesterday");
  if (diffDays < 7) return t("timeAgo.daysAgo", { count: diffDays });

  return timestamp.toLocaleDateString(getDateLocale(locale), {
    month: "short",
    day: "numeric",
  });
}

type TimeGroup = "today" | "thisWeek" | "earlier";

function getTimeGroup(timestamp: Date, now: Date): TimeGroup {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  if (timestamp >= startOfToday) return "today";
  if (timestamp >= startOfWeek) return "thisWeek";
  return "earlier";
}

export default function NotificationsPage() {
  const locale = useLocale();
  const t = useTranslations("notifications");
  const { user, groupId, loading: groupLoading } = useGroup();
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    data: notifications,
    isLoading,
    error,
    refetch,
  } = useNotifications(50);

  const now = new Date();

  const unreadCount = useMemo(() => {
    if (!notifications) return 0;
    return notifications.filter(
      (n: Record<string, unknown>) => !n.is_read
    ).length;
  }, [notifications]);

  const grouped = useMemo(() => {
    const groups: Record<TimeGroup, Record<string, unknown>[]> = {
      today: [],
      thisWeek: [],
      earlier: [],
    };
    if (!notifications) return groups;

    for (const notif of notifications) {
      const ts = new Date((notif as Record<string, unknown>).created_at as string);
      const group = getTimeGroup(ts, now);
      groups[group].push(notif as Record<string, unknown>);
    }
    return groups;
  }, [notifications, now]);

  const markAsRead = async (id: string) => {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    queryClient.invalidateQueries({
      queryKey: ["notifications", user?.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["unread-notifications", user?.id],
    });
  };

  const markAllRead = async () => {
    if (!user) return;
    const supabase = createClient();
    let query = supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (groupId) query = query.eq("group_id", groupId);
    await query;
    queryClient.invalidateQueries({
      queryKey: ["notifications", user.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["unread-notifications", user.id],
    });
  };

  const groupOrder: { key: TimeGroup; label: string }[] = [
    { key: "today", label: t("today") },
    { key: "thisWeek", label: t("thisWeek") },
    { key: "earlier", label: t("earlier") },
  ];

  if (groupLoading || isLoading) return <ListSkeleton rows={6} />;

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  const allNotifications = notifications || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("unreadCount", { count: unreadCount })}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="gap-1.5"
          >
            <CheckCheck className="h-4 w-4" />
            <span className="hidden sm:inline">{t("markAllRead")}</span>
          </Button>
        </div>
      </div>

      {/* Notification Groups */}
      {groupOrder.map(({ key, label }) => {
        const items = grouped[key];
        if (items.length === 0) return null;

        return (
          <div key={key} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </h2>
            <div className="space-y-2">
              {items.map((notif) => {
                const type = (notif.type as string) || "announcement";
                const Icon = TYPE_ICONS[type] || Bell;
                const isRead = notif.is_read as boolean;
                const timestamp = new Date(notif.created_at as string);

                return (
                  <Card
                    key={notif.id as string}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      !isRead ? "bg-primary/5 dark:bg-primary/10" : ""
                    }`}
                    onClick={() => {
                      if (!isRead) markAsRead(notif.id as string);
                      // Navigate to deep link if present
                      const notifData = notif.data as Record<string, unknown> | null;
                      const link = (notifData?.link as string) || getNotificationLink(type);
                      if (link) router.push(link);
                    }}
                  >
                    <CardContent className="flex items-start gap-3 p-3 sm:p-4">
                      {/* Type icon */}
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TYPE_BG[type] || TYPE_BG.announcement}`}
                      >
                        <Icon
                          className={`h-4.5 w-4.5 ${TYPE_COLORS[type] || TYPE_COLORS.announcement}`}
                        />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-sm leading-tight ${
                                  !isRead
                                    ? "font-semibold"
                                    : "font-medium"
                                }`}
                              >
                                {(notif.title as string) || ""}
                              </p>
                              <Badge
                                variant="outline"
                                className="hidden shrink-0 text-[10px] sm:inline-flex"
                              >
                                {t(`types.${type}`)}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {(notif.body as string) || ""}
                            </p>
                          </div>

                          {/* Right side: time + unread dot */}
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {getRelativeTime(timestamp, now, t, locale)}
                            </span>
                            {!isRead ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                            ) : (
                              <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {allNotifications.length === 0 && (
        <EmptyState
          icon={Bell}
          title={t("noNotifications")}
          description={t("noNotificationsDesc")}
        />
      )}
    </div>
  );
}
