"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Users,
  Ban,
  CheckCircle,
  Archive,
  ArrowUpDown,
  Building2,
} from "lucide-react";

type GroupStatus = "active" | "suspended" | "archived";

interface AdminGroup {
  id: string;
  name: string;
  organization: string;
  group_type: string | null;
  currency: string | null;
  is_active: boolean;
  created_at: string;
  memberCount: number;
}

const statusConfig: Record<GroupStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "statusActive" },
  suspended: { variant: "destructive", label: "statusSuspended" },
  archived: { variant: "secondary", label: "statusArchived" },
};

export default function AdminGroupsPage() {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GroupStatus | "all">("all");
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGroups() {
      const supabase = createClient();

      const { data: groupsData } = await supabase
        .from("groups")
        .select("id, name, group_type, currency, is_active, created_at, organization_id, organizations(name)")
        .order("created_at", { ascending: false });

      if (!groupsData) {
        setLoading(false);
        return;
      }

      // Fetch member counts per group
      const groupIds = groupsData.map((g) => g.id);
      const { data: memberCounts } = await supabase
        .from("memberships")
        .select("group_id")
        .in("group_id", groupIds);

      const countMap: Record<string, number> = {};
      if (memberCounts) {
        for (const m of memberCounts) {
          countMap[m.group_id] = (countMap[m.group_id] || 0) + 1;
        }
      }

      const mapped: AdminGroup[] = groupsData.map((g) => {
        const orgs = g.organizations as unknown as { name: string }[] | { name: string } | null;
        const orgName = Array.isArray(orgs) ? orgs[0]?.name : orgs?.name;
        return {
          id: g.id,
          name: g.name,
          organization: orgName ?? g.group_type ?? "--",
          group_type: g.group_type,
          currency: g.currency,
          is_active: g.is_active,
          created_at: g.created_at,
          memberCount: countMap[g.id] ?? 0,
        };
      });

      setGroups(mapped);
      setLoading(false);
    }

    fetchGroups();
  }, []);

  function getGroupStatus(group: AdminGroup): GroupStatus {
    // Derive status from is_active field
    if (!group.is_active) return "suspended";
    return "active";
  }

  const filtered = groups.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.organization.toLowerCase().includes(search.toLowerCase());
    const derivedStatus = getGroupStatus(g);
    const matchesStatus = statusFilter === "all" || derivedStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses: Array<GroupStatus | "all"> = ["all", "active", "suspended", "archived"];
  const statusLabels: Record<string, string> = {
    all: "allStatuses",
    active: "statusActive",
    suspended: "statusSuspended",
    archived: "statusArchived",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("groups")}</h1>
        <p className="text-muted-foreground">{t("groupsSubtitle")}</p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchGroups")}
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

      {/* Group Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
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
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("noGroups")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((group) => {
            const derivedStatus = getGroupStatus(group);
            const status = statusConfig[derivedStatus];
            return (
              <Card key={group.id} className="transition-all hover:shadow-md">
                <CardContent className="p-4 space-y-3">
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.organization}</p>
                    </div>
                    <Badge variant={status.variant} className="shrink-0">
                      {t(status.label)}
                    </Badge>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">{t("planTier")}</p>
                      <p className="font-medium">{group.group_type ?? "--"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("memberCount")}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {group.memberCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("createdDate")}</p>
                      <p className="font-medium">{new Date(group.created_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("collectionRate")}</p>
                      <p className="font-medium text-muted-foreground">--</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {derivedStatus === "active" ? (
                      <Button variant="outline" size="sm" className="text-xs">
                        <Ban className="mr-1.5 h-3 w-3" />
                        {t("suspendGroup")}
                      </Button>
                    ) : derivedStatus === "suspended" ? (
                      <Button variant="outline" size="sm" className="text-xs">
                        <CheckCircle className="mr-1.5 h-3 w-3" />
                        {t("activateGroup")}
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" className="text-xs">
                      <ArrowUpDown className="mr-1.5 h-3 w-3" />
                      {t("changePlan")}
                    </Button>
                    {derivedStatus !== "archived" && (
                      <Button variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive">
                        <Archive className="mr-1.5 h-3 w-3" />
                        {t("archiveGroup")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
