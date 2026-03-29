"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { createClient } from "@/lib/supabase/client";
import { Bell, Search, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  is_read: boolean;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

export default function AdminNotificationsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [totalSent, setTotalSent] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchNotifications() {
      const supabase = createClient();

      // Fetch notifications with profile join
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, type, title, is_read, created_at, profiles:user_id(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data) {
        setNotifications(data as unknown as NotificationRow[]);
        setTotalSent(data.length);
        setDeliveredCount(data.filter((n) => n.is_read).length);

        // Pending = unread and created within last 24h
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        setPendingCount(
          data.filter((n) => !n.is_read && n.created_at > oneDayAgo).length
        );
      }

      setLoading(false);
    }

    fetchNotifications();
  }, []);

  const filteredNotifications = notifications.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = n.profiles?.full_name?.toLowerCase() ?? "";
    return (
      name.includes(q) ||
      n.title.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q)
    );
  });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(dateLocale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      payment_reminder: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      event_reminder: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      standing_change: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      announcement: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      hosting_reminder: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
      relief_update: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      new_member: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    };
    return colors[type] || "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6" />
          {t("notifManagementTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("notifManagementDesc")}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("totalSent")}</p>
            <p className="text-2xl font-bold mt-1">{totalSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("delivered")}</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{deliveredCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("failedDeliveries")}</p>
            <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("pendingNotifs")}</p>
            <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="logs">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="logs" className="flex-1 sm:flex-initial">
            {t("notifLogsTab")}
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex-1 sm:flex-initial">
            {t("templatesTab")}
          </TabsTrigger>
          <TabsTrigger value="failed" className="flex-1 sm:flex-initial">
            {t("failedTab")}
          </TabsTrigger>
        </TabsList>

        {/* Notification Logs */}
        <TabsContent value="logs" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("searchNotifs")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>{t("noNotifications")}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">{t("recipient")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("type")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("notifSubject")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("notifStatus")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("notifDate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNotifications.map((n) => (
                        <tr key={n.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3">
                            {n.profiles?.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={getTypeBadgeColor(n.type)}>
                              {n.type.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 max-w-[200px] truncate">{n.title}</td>
                          <td className="px-4 py-3">
                            {n.is_read ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                {t("read")}
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                {t("unread")}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {formatDate(n.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardContent className="py-8">
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{t("templatesFuture")}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">{t("systemNotifTypes")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Failed Deliveries */}
        <TabsContent value="failed" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("noFailedDeliveries")}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
