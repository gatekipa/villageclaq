"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Shield, Users, Search, AlertCircle } from "lucide-react";

interface AdminRecord {
  membershipId: string;
  userId: string;
  displayName: string;
  fullName: string;
  role: string;
  groupName: string;
  groupIsActive: boolean;
  updatedAt: string | null;
}

export default function GroupAdminsPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");

  const { results, loading, error } = useAdminQuery([
    {
      key: "admins",
      table: "memberships",
      select: "id, user_id, role, display_name, groups!inner(name, is_active), profiles!memberships_user_id_fkey(full_name, updated_at)",
      filters: [
        { column: "role", op: "in", value: ["admin", "owner"] },
        { column: "user_id", op: "not.is", value: null },
      ],
    },
  ]);

  const admins: AdminRecord[] = useMemo(() => {
    const data = results.admins?.data ?? [];
    return (data as Array<Record<string, unknown>>).map((m) => {
      const group = m.groups as Record<string, unknown>;
      const profile = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as Record<string, unknown> | null;
      return {
        membershipId: m.id as string,
        userId: m.user_id as string,
        displayName: (m.display_name as string) || "",
        fullName: (profile?.full_name as string) || "",
        role: m.role as string,
        groupName: (group?.name as string) || "\u2014",
        groupIsActive: (group?.is_active as boolean) ?? true,
        updatedAt: (profile?.updated_at as string) || null,
      };
    });
  }, [results]);

  const filtered = useMemo(() => {
    if (!search) return admins;
    const q = search.toLowerCase();
    return admins.filter((a) =>
      a.fullName.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q) || a.groupName.toLowerCase().includes(q)
    );
  }, [admins, search]);

  const totalAdmins = admins.length;
  const activeAdmins = admins.filter((a) => a.groupIsActive).length;
  const suspendedAdmins = admins.filter((a) => !a.groupIsActive).length;

  if (error) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh]"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><p className="text-sm text-destructive">{error}</p></div>;
  }

  const roleColors: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">{t("groupAdministrators")}</h1><p className="text-muted-foreground">{t("groupAdminsSubtitle")}</p></div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("totalAdmins"), value: totalAdmins, icon: Shield },
          { label: t("activeAdmins"), value: activeAdmins, icon: Users },
          { label: t("suspended"), value: suspendedAdmins, icon: AlertCircle },
          { label: t("totalActions"), value: "\u2014", icon: Shield },
        ].map((c, i) => (
          <Card key={i}><CardContent className="p-4 flex items-center gap-3"><c.icon className="h-5 w-5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground">{c.label}</p>{loading ? <Skeleton className="h-6 w-12" /> : <p className="text-xl font-bold">{c.value}</p>}</div></CardContent></Card>
        ))}
      </div>

      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("searchAdmins")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>

      {loading ? <Skeleton className="h-64" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Shield className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>No group administrators found</p></div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("userName")}</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("groupName")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("staffRole")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("lastActive")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("status")}</th>
            </tr></thead>
            <tbody>
              {filtered.map((admin) => (
                <tr key={admin.membershipId} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{admin.fullName || admin.displayName || "\u2014"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{admin.groupName}</td>
                  <td className="px-4 py-3 text-center"><Badge className={`text-xs ${roleColors[admin.role] || ""}`}>{admin.role === "owner" ? "Group Owner" : "Administrator"}</Badge></td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{admin.updatedAt ? new Date(admin.updatedAt).toLocaleDateString(getDateLocale(locale), { month: "short", day: "numeric" }) : "\u2014"}</td>
                  <td className="px-4 py-3 text-center"><Badge variant={admin.groupIsActive ? "default" : "destructive"}>{admin.groupIsActive ? t("statusActive") : t("statusSuspended")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
