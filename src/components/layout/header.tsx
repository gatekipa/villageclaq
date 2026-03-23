"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Bell, Menu, Calendar, CreditCard, FileText, Heart, Users, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroupSwitcher } from "./group-switcher";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";
import { useNotifications, useUnreadNotificationCount } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  onMenuClick: () => void;
}

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  contribution_due: CreditCard,
  payment_received: CreditCard,
  meeting_scheduled: Calendar,
  event_reminder: Calendar,
  minutes_published: FileText,
  relief_claim: Heart,
  member_joined: Users,
  announcement: Megaphone,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Header({ onMenuClick }: HeaderProps) {
  const t = useTranslations("header");
  const [isOpen, setIsOpen] = useState(false);
  const { data: notifications = [] } = useNotifications(5);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  async function markAllAsRead() {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <GroupSwitcher />
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />

        {/* Notification bell */}
        <div className="relative">
          <Button variant="ghost" size="icon" title={t("notifications")} onClick={() => setIsOpen(!isOpen)}>
            <div className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center bg-red-500 text-white border-0">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </div>
          </Button>

          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg sm:w-96">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">{t("notifications")}</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">
                      {t("markAllRead")}
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((notification: Record<string, unknown>) => {
                      const Icon = NOTIFICATION_ICONS[notification.type as string] || Bell;
                      const isRead = notification.is_read as boolean;
                      return (
                        <button
                          key={notification.id as string}
                          onClick={() => {
                            if (!isRead) markAsRead(notification.id as string);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                            !isRead && "bg-emerald-50/50 dark:bg-emerald-950/20"
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            !isRead ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {!isRead && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                            </div>
                            <p className="text-sm font-medium truncate">{notification.title as string}</p>
                            <p className="text-xs text-muted-foreground truncate">{notification.body as string}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(notification.created_at as string)}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="border-t px-4 py-2">
                  <Link href="/dashboard/notifications" onClick={() => setIsOpen(false)} className="block text-center text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                    {t("viewAll")}
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        <UserMenu />
      </div>
    </header>
  );
}
