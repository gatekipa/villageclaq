"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  name: string;
  email: string;
  phone: string;
  signupDate: string;
  groupsCount: number;
  lastActive: string;
  status: UserStatus;
}

const mockUsers: AdminUser[] = [
  { id: "1", name: "Cyril Ndonwi", email: "cyril.ndonwi@gmail.com", phone: "+237 670 123 456", signupDate: "2024-01-10", groupsCount: 3, lastActive: "2026-03-22", status: "active" },
  { id: "2", name: "Aissatou Mbarga", email: "aissatou.m@yahoo.fr", phone: "+237 655 987 321", signupDate: "2024-02-14", groupsCount: 1, lastActive: "2026-03-20", status: "active" },
  { id: "3", name: "Kwame Asante", email: "k.asante@outlook.com", phone: "+233 24 567 8901", signupDate: "2024-03-01", groupsCount: 5, lastActive: "2026-03-23", status: "active" },
  { id: "4", name: "Fatou Diallo", email: "fatou.diallo@gmail.com", phone: "+221 77 234 5678", signupDate: "2024-04-18", groupsCount: 2, lastActive: "2026-02-15", status: "suspended" },
  { id: "5", name: "Emeka Okonkwo", email: "emeka.ok@hotmail.com", phone: "+234 803 456 7890", signupDate: "2024-05-22", groupsCount: 4, lastActive: "2026-03-21", status: "active" },
  { id: "6", name: "Ngozi Achebe", email: "ngozi.a@gmail.com", phone: "+234 812 345 6789", signupDate: "2024-06-10", groupsCount: 1, lastActive: "2026-01-30", status: "suspended" },
  { id: "7", name: "Jean-Pierre Kamga", email: "jp.kamga@yahoo.fr", phone: "+237 699 876 543", signupDate: "2024-07-03", groupsCount: 2, lastActive: "2026-03-19", status: "active" },
  { id: "8", name: "Amina Traore", email: "amina.traore@gmail.com", phone: "+225 07 89 12 34", signupDate: "2024-08-15", groupsCount: 3, lastActive: "2026-03-18", status: "active" },
  { id: "9", name: "Moussa Keita", email: "moussa.k@outlook.com", phone: "+223 76 54 32 10", signupDate: "2024-09-01", groupsCount: 1, lastActive: "2026-03-10", status: "active" },
  { id: "10", name: "Sylvie Fotso", email: "sylvie.fotso@gmail.com", phone: "+237 677 111 222", signupDate: "2024-10-20", groupsCount: 6, lastActive: "2026-03-23", status: "active" },
];

const statusConfig: Record<UserStatus, { variant: "default" | "destructive"; label: string }> = {
  active: { variant: "default", label: "statusActive" },
  suspended: { variant: "destructive", label: "statusSuspended" },
};

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");

  const filtered = mockUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search);
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
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
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("noUsers")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((user) => {
            const status = statusConfig[user.status];
            const initials = user.name
              .split(" ")
              .map((n) => n[0])
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
                        <p className="truncate text-sm font-semibold">{user.name}</p>
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
                        <span className="truncate">{user.phone}</span>
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
                        {new Date(user.signupDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("lastActive")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(user.lastActive).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {user.status === "active" ? (
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
