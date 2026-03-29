"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatAmount } from "@/lib/currencies";
import { Globe, Users, Shield, Search, AlertCircle } from "lucide-react";

interface MultiGroupUser {
  userId: string;
  name: string;
  groups: Array<{ name: string; role: string }>;
  adminCount: number;
  totalPaid: number;
  isNew: boolean;
}

export default function MultiGroupPage() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<MultiGroupUser[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();

        // Get all memberships with group info
        const { data: memberships, error: mErr } = await supabase
          .from("memberships")
          .select("user_id, role, groups!inner(name), profiles!memberships_user_id_fkey(full_name, created_at)")
          .not("user_id", "is", null);
        if (mErr) throw mErr;

        // Group by user_id
        const userMap = new Map<string, { name: string; groups: Array<{ name: string; role: string }>; isNew: boolean }>();
        for (const m of (memberships || []) as Array<Record<string, unknown>>) {
          const uid = m.user_id as string;
          const group = m.groups as Record<string, unknown>;
          const profile = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as Record<string, unknown> | null;
          if (!userMap.has(uid)) {
            const createdAt = profile?.created_at as string;
            userMap.set(uid, {
              name: (profile?.full_name as string) || "—",
              groups: [],
              isNew: createdAt ? (Date.now() - new Date(createdAt).getTime()) < 30 * 86400000 : false,
            });
          }
          userMap.get(uid)!.groups.push({ name: (group?.name as string) || "—", role: (m.role as string) || "member" });
        }

        // Filter to multi-group users only
        const multiGroupUsers: MultiGroupUser[] = [];
        for (const [userId, data] of userMap.entries()) {
          if (data.groups.length < 2) continue;
          multiGroupUsers.push({
            userId,
            name: data.name,
            groups: data.groups,
            adminCount: data.groups.filter((g) => g.role === "admin" || g.role === "owner").length,
            totalPaid: 0, // Would need payments query per user — show 0 honestly
            isNew: data.isNew,
          });
        }

        setUsers(multiGroupUsers.sort((a, b) => b.groups.length - a.groups.length));
      } catch (err) { setError((err as Error).message); }
      finally { setLoading(false); }
    }
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q));
  }, [users, search]);

  const avgGroups = users.length > 0 ? (users.reduce((s, u) => s + u.groups.length, 0) / users.length).toFixed(1) : "0";
  const withAdminRoles = users.filter((u) => u.adminCount > 0).length;

  if (error) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh]"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><p className="text-sm text-destructive">{error}</p></div>;
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">{t("multiGroupParticipation")}</h1><p className="text-muted-foreground">{t("multiGroupSubtitle")}</p></div>

      <div className="grid gap-4 grid-cols-3">
        {[
          { label: t("multiGroupUsers"), value: users.length, icon: Globe },
          { label: t("usersWithAdminRoles"), value: withAdminRoles, icon: Shield },
          { label: t("avgGroupsPerUser"), value: avgGroups, icon: Users },
        ].map((c, i) => (
          <Card key={i}><CardContent className="p-4 flex items-center gap-3"><c.icon className="h-5 w-5 text-muted-foreground shrink-0" /><div><p className="text-xs text-muted-foreground">{c.label}</p>{loading ? <Skeleton className="h-6 w-12" /> : <p className="text-xl font-bold">{c.value}</p>}</div></CardContent></Card>
        ))}
      </div>

      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("searchMultiGroup")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>

      {loading ? <Skeleton className="h-64" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Globe className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>{t("noMultiGroupUsers")}</p></div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("userName")}</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("groups")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("totalAdmins")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Flags</th>
            </tr></thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.userId} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.groups.slice(0, 3).map((g, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{g.name}</Badge>
                      ))}
                      {user.groups.length > 3 && <Badge variant="secondary" className="text-[10px]">+{user.groups.length - 3}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">{user.adminCount}</td>
                  <td className="px-4 py-3 text-center">
                    {user.isNew && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{t("newUser")}</Badge>}
                    {user.groups.length >= 4 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] ml-1">{t("highActivity")}</Badge>}
                    {!user.isNew && user.groups.length < 4 && <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
