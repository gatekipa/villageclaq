"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Users,
  Ban,
  CheckCircle,
  Eye,
  AlertTriangle,
  Mail,
  Phone,
  Calendar,
  Clock,
} from "lucide-react";

type UserStatus = "active" | "suspended";

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  groupsCount: number;
}

const statusConfig: Record<UserStatus, { variant: "default" | "destructive"; label: string }> = {
  active: { variant: "default", label: "statusActive" },
  suspended: { variant: "destructive", label: "statusSuspended" },
};

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      const supabase = createClient();

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url, created_at")
        .order("created_at", { ascending: false });

      if (!profilesData) {
        setLoading(false);
        return;
      }

      // Fetch group counts per user
      const userIds = profilesData.map((u) => u.id);
      const { data: membershipData } = await supabase
        .from("memberships")
        .select("user_id")
        .in("user_id", userIds);

      const countMap: Record<string, number> = {};
      if (membershipData) {
        for (const m of membershipData) {
          countMap[m.user_id] = (countMap[m.user_id] || 0) + 1;
        }
      }

      const mapped: AdminUser[] = profilesData.map((u) => ({
        id: u.id,
        full_name: u.full_name ?? "",
        email: u.email ?? "",
        phone: u.phone ?? null,
        avatar_url: u.avatar_url ?? null,
        created_at: u.created_at,
        groupsCount: countMap[u.id] ?? 0,
      }));

      setUsers(mapped);
      setLoading(false);
    }

    fetchUsers();
  }, []);

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone && u.phone.includes(search));
    // No suspended column in profiles yet, treat all as active
    const matchesStatus = statusFilter === "all" || statusFilter === "active";
    return matchesSearch && matchesStatus;
  });

  const statuses: Array<UserStatus | "all"> = ["all", "active", "suspended"];
  const statusLabels: Record<string, string> = {
    all: "allStatuses",
    active: "statusActive",
    suspended: "statusSuspended",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("users")}</h1>
        <p className="text-muted-foreground">{t("usersSubtitle")}</p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchUsers")}
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

      {/* User Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
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
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("noUsers")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((user) => {
            const userStatus: UserStatus = "active";
            const status = statusConfig[userStatus];
            const initials = user.full_name
              .split(" ")
              .map((n) => n[0])
              .filter(Boolean)
              .join("");
            return (
              <Card key={user.id} className="transition-all hover:shadow-md">
                <CardContent className="p-4 space-y-3">
                  {/* Top row: avatar + name + status */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{user.full_name}</p>
                        <Badge variant={status.variant} className="shrink-0">
                          {t(status.label)}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        {user.email}
                      </p>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">{t("userPhone")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{user.phone ?? "--"}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("groupsCount")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {user.groupsCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("signupDate")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("lastActive")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        --
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {userStatus === "active" ? (
                      <Button variant="outline" size="sm" className="text-xs">
                        <Ban className="mr-1.5 h-3 w-3" />
                        {t("suspendUser")}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="text-xs">
                        <CheckCircle className="mr-1.5 h-3 w-3" />
                        {t("activateUser")}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="text-xs text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300">
                      <Eye className="mr-1.5 h-3 w-3" />
                      {t("impersonate")}
                      <AlertTriangle className="ml-1 h-3 w-3" />
                    </Button>
                  </div>

                  {/* Impersonate warning */}
                  <p className="text-[10px] text-yellow-600 dark:text-yellow-400 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    {t("impersonateWarning")}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
