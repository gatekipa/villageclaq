"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface Notification {
  id: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  timestamp: Date;
  isRead: boolean;
}

const TYPE_ICONS: Record<NotificationType, React.ElementType> = {
  event: Calendar,
  payment: HandCoins,
  announcement: Megaphone,
  relief: Heart,
  minutes: FileText,
  member: Users,
};

const TYPE_COLORS: Record<NotificationType, string> = {
  event: "text-blue-500 dark:text-blue-400",
  payment: "text-amber-500 dark:text-amber-400",
  announcement: "text-purple-500 dark:text-purple-400",
  relief: "text-rose-500 dark:text-rose-400",
  minutes: "text-slate-500 dark:text-slate-400",
  member: "text-emerald-500 dark:text-emerald-400",
};

const TYPE_BG: Record<NotificationType, string> = {
  event: "bg-blue-50 dark:bg-blue-950/40",
  payment: "bg-amber-50 dark:bg-amber-950/40",
  announcement: "bg-purple-50 dark:bg-purple-950/40",
  relief: "bg-rose-50 dark:bg-rose-950/40",
  minutes: "bg-slate-50 dark:bg-slate-950/40",
  member: "bg-emerald-50 dark:bg-emerald-950/40",
};

function createMockNotifications(): Notification[] {
  const now = new Date();

  return [
    // Today - 3 notifications
    {
      id: "1",
      type: "payment",
      titleKey: "paymentReminderTitle",
      bodyKey: "paymentReminderBody",
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
      isRead: false,
    },
    {
      id: "2",
      type: "event",
      titleKey: "eventRsvpTitle",
      bodyKey: "eventRsvpBody",
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5h ago
      isRead: false,
    },
    {
      id: "3",
      type: "minutes",
      titleKey: "minutesPublishedTitle",
      bodyKey: "minutesPublishedBody",
      timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000), // 8h ago
      isRead: true,
    },
    // This Week - 4 notifications
    {
      id: "4",
      type: "relief",
      titleKey: "reliefApprovedTitle",
      bodyKey: "reliefApprovedBody",
      timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // Yesterday
      isRead: false,
    },
    {
      id: "5",
      type: "member",
      titleKey: "newMemberTitle",
      bodyKey: "newMemberBody",
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      isRead: true,
    },
    {
      id: "6",
      type: "event",
      titleKey: "eventWeekTitle",
      bodyKey: "eventWeekBody",
      timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      isRead: false,
    },
    {
      id: "7",
      type: "payment",
      titleKey: "paymentConfirmTitle",
      bodyKey: "paymentConfirmBody",
      timestamp: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      isRead: true,
    },
    // Earlier - 3 notifications
    {
      id: "8",
      type: "announcement",
      titleKey: "announcementTitle",
      bodyKey: "announcementBody",
      timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      isRead: true,
    },
    {
      id: "9",
      type: "minutes",
      titleKey: "minutesWeekTitle",
      bodyKey: "minutesWeekBody",
      timestamp: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      isRead: true,
    },
    {
      id: "10",
      type: "relief",
      titleKey: "reliefEarlierTitle",
      bodyKey: "reliefEarlierBody",
      timestamp: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000), // 21 days ago
      isRead: true,
    },
  ];
}

function getRelativeTime(
  timestamp: Date,
  now: Date,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return t("timeAgo.justNow");
  if (diffMinutes < 60) return t("timeAgo.minutesAgo", { count: diffMinutes });
  if (diffHours < 24) return t("timeAgo.hoursAgo", { count: diffHours });
  if (diffDays === 1) return t("timeAgo.yesterday");
  if (diffDays < 7) return t("timeAgo.daysAgo", { count: diffDays });

  return timestamp.toLocaleDateString(undefined, {
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
  const t = useTranslations("notifications");
  const [notifications, setNotifications] = useState<Notification[]>(
    createMockNotifications
  );

  const now = new Date();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const grouped = notifications.reduce<Record<TimeGroup, Notification[]>>(
    (acc, notif) => {
      const group = getTimeGroup(notif.timestamp, now);
      acc[group].push(notif);
      return acc;
    },
    { today: [], thisWeek: [], earlier: [] }
  );

  const toggleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const groupOrder: { key: TimeGroup; label: string }[] = [
    { key: "today", label: t("today") },
    { key: "thisWeek", label: t("thisWeek") },
    { key: "earlier", label: t("earlier") },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
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
                const Icon = TYPE_ICONS[notif.type];
                return (
                  <Card
                    key={notif.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      !notif.isRead
                        ? "bg-primary/5 dark:bg-primary/10"
                        : ""
                    }`}
                    onClick={() => toggleRead(notif.id)}
                  >
                    <CardContent className="flex items-start gap-3 p-3 sm:p-4">
                      {/* Type icon */}
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TYPE_BG[notif.type]}`}
                      >
                        <Icon
                          className={`h-4.5 w-4.5 ${TYPE_COLORS[notif.type]}`}
                        />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-sm leading-tight ${
                                  !notif.isRead
                                    ? "font-semibold"
                                    : "font-medium"
                                }`}
                              >
                                {t(`mock.${notif.titleKey}`)}
                              </p>
                              <Badge
                                variant="outline"
                                className="hidden shrink-0 text-[10px] sm:inline-flex"
                              >
                                {t(`types.${notif.type}`)}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {t(`mock.${notif.bodyKey}`)}
                            </p>
                          </div>

                          {/* Right side: time + unread dot */}
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {getRelativeTime(notif.timestamp, now, t)}
                            </span>
                            {!notif.isRead ? (
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
      {notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Bell className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {t("noNotifications")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noNotificationsDesc")}
          </p>
        </div>
      )}
    </div>
  );
}
