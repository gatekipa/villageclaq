"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { Layers, Search, AlertCircle } from "lucide-react";

const typeEmojis: Record<string, string> = {
  village_association: "🏘️", alumni_union: "🎓", njangi: "💰", church_group: "⛪",
  family_meeting: "👨‍👩‍👧‍👦", professional_network: "💼", social_club: "🎉", other: "📋",
  savings_circle: "💰", general: "📋", diaspora: "🌍", cooperative: "🤝",
};

export default function GroupTypesPage() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Array<{ group_type: string; is_active: boolean }>>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();
        const { data, error: err } = await supabase.from("groups").select("group_type, is_active");
        if (err) throw err;
        setGroups(data || []);
      } catch (err) { setError((err as Error).message); }
      finally { setLoading(false); }
    }
    fetchData();
  }, []);

  const typeStats = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    for (const g of groups) {
      const type = g.group_type || "other";
      const existing = map.get(type) || { total: 0, active: 0 };
      existing.total++;
      if (g.is_active) existing.active++;
      map.set(type, existing);
    }
    return Array.from(map.entries())
      .map(([type, counts]) => ({ type, ...counts }))
      .filter((t) => !search || t.type.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [groups, search]);

  const totalTypes = new Set(groups.map((g) => g.group_type || "other")).size;
  const activeTypes = new Set(groups.filter((g) => g.is_active).map((g) => g.group_type || "other")).size;

  if (error) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh]"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><p className="text-sm text-destructive">{error}</p></div>;
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">{t("groupTypes")}</h1><p className="text-muted-foreground">{t("groupTypesSubtitle")}</p></div>

      <div className="grid gap-4 grid-cols-3">
        {[
          { label: t("totalTypes"), value: totalTypes },
          { label: t("activeTypes"), value: activeTypes },
          { label: t("groupsUsingTypes"), value: groups.length },
        ].map((c, i) => (
          <Card key={i}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{c.label}</p>{loading ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-2xl font-bold">{c.value}</p>}</CardContent></Card>
        ))}
      </div>

      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("searchGroupTypes")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>

      {loading ? <Skeleton className="h-64" /> : typeStats.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Layers className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>{t("comingSoon")}</p></div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("groupTypes")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("groupsUsingTypes")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("activeTypes")}</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("status")}</th>
            </tr></thead>
            <tbody>
              {typeStats.map((ts) => (
                <tr key={ts.type} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium"><span className="mr-2">{typeEmojis[ts.type] || "📋"}</span>{ts.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-center">{ts.total}</td>
                  <td className="px-4 py-3 text-center">{ts.active}</td>
                  <td className="px-4 py-3 text-center"><Badge variant={ts.active > 0 ? "default" : "secondary"}>{ts.active > 0 ? t("statusActive") : t("statusArchived")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
