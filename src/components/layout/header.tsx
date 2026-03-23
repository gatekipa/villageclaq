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

interface HeaderProps {
  onMenuClick: () => void;
}

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  payment: CreditCard,
  event: Calendar,
  minutes: FileText,
  relief: Heart,
  member: Users,
  announcement: Megaphone,
};

const mockNotifications = [
  { id: "1", type: "payment", groupName: "Bamenda Alumni", title: "Payment received", body: "XAF 15,000 for Monthly Dues confirmed", time: "2 min ago", read: false },
  { id: "2", type: "event", groupName: "Bamenda Alumni", title: "Meeting tomorrow", body: "Monthly meeting at 6 PM, City Hall", time: "1 hr ago", read: false },
  { id: "3", type: "minutes", groupName: "Njangi Group A", title: "Minutes published", body: "March meeting minutes are ready", time: "3 hrs ago", read: false },
  { id: "4", type: "announcement", groupName: "Bamenda Alumni", title: "Important update", body: "Annual general meeting rescheduled", time: "1 day ago", read: true },
  { id: "5", type: "relief", groupName: "Church Group", title: "Claim approved", body: "Bereavement fund claim approved", time: "2 days ago", read: true },
];

export function Header({ onMenuClick }: HeaderProps) {
  const t = useTranslations("header");
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
      {/* Mobile hamburger */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Group Switcher */}
      <GroupSwitcher />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />

        {/* Notification bell with dropdown */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            title={t("notifications")}
            onClick={() => setIsOpen(!isOpen)}
          >
            <div className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center bg-red-500 text-white border-0">
                  {unreadCount}
                </Badge>
              )}
            </div>
          </Button>

          {/* Dropdown */}
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg sm:w-96">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">{t("notifications")}</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      {t("markAllRead")}
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.slice(0, 5).map((notification) => {
                    const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                    return (
                      <button
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                          !notification.read && "bg-emerald-50/50 dark:bg-emerald-950/20"
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          !notification.read ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{notification.groupName}</span>
                            {!notification.read && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <p className="text-sm font-medium truncate">{notification.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{notification.body}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{notification.time}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t px-4 py-2">
                  <Link
                    href="/dashboard/notifications"
                    onClick={() => setIsOpen(false)}
                    className="block text-center text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    {t("viewAll")}
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User avatar */}
        <UserMenu />
      </div>
    </header>
  );
}
