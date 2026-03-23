"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
type PlanTier = "free" | "starter" | "pro" | "enterprise";

interface AdminGroup {
  id: string;
  name: string;
  organization: string;
  plan: PlanTier;
  memberCount: number;
  createdAt: string;
  status: GroupStatus;
  collectionRate: number;
}

const mockGroups: AdminGroup[] = [
  { id: "1", name: "Bali Nyonga Development Union", organization: "Village Association", plan: "pro", memberCount: 245, createdAt: "2024-01-10", status: "active", collectionRate: 92 },
  { id: "2", name: "Njangi Mankon Elites", organization: "Njangi Group", plan: "starter", memberCount: 38, createdAt: "2024-02-18", status: "active", collectionRate: 87 },
  { id: "3", name: "Bamenda Alumni Network", organization: "Alumni Union", plan: "enterprise", memberCount: 512, createdAt: "2023-11-05", status: "active", collectionRate: 95 },
  { id: "4", name: "Douala Women of Faith", organization: "Church Group", plan: "free", memberCount: 22, createdAt: "2024-05-20", status: "suspended", collectionRate: 45 },
  { id: "5", name: "Limbe Fishermen Coop", organization: "Cooperative", plan: "starter", memberCount: 67, createdAt: "2024-03-12", status: "active", collectionRate: 78 },
  { id: "6", name: "Kumba Progressive Union", organization: "Village Association", plan: "pro", memberCount: 189, createdAt: "2024-01-28", status: "active", collectionRate: 91 },
  { id: "7", name: "Buea Tech Founders", organization: "Professional Group", plan: "starter", memberCount: 31, createdAt: "2024-07-02", status: "archived", collectionRate: 60 },
  { id: "8", name: "Foumban Cultural Heritage", organization: "Cultural Association", plan: "enterprise", memberCount: 340, createdAt: "2023-09-15", status: "active", collectionRate: 88 },
  { id: "9", name: "Yaounde Njangi Circle", organization: "Njangi Group", plan: "free", memberCount: 15, createdAt: "2024-08-10", status: "active", collectionRate: 72 },
  { id: "10", name: "Bafoussam Traders Alliance", organization: "Business Group", plan: "pro", memberCount: 156, createdAt: "2024-04-05", status: "suspended", collectionRate: 53 },
];

const statusConfig: Record<GroupStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "statusActive" },
  suspended: { variant: "destructive", label: "statusSuspended" },
  archived: { variant: "secondary", label: "statusArchived" },
};

const planConfig: Record<PlanTier, { color: string; label: string }> = {
  free: { color: "bg-slate-500/10 text-slate-700 dark:text-slate-300", label: "planFree" },
  starter: { color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "planStarter" },
  pro: { color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", label: "planPro" },
  enterprise: { color: "bg-purple-500/10 text-purple-700 dark:text-purple-400", label: "planEnterprise" },
};

export default function AdminGroupsPage() {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GroupStatus | "all">("all");

  const filtered = mockGroups.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.organization.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || g.status === statusFilter;
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
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("noGroups")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((group) => {
            const plan = planConfig[group.plan];
            const status = statusConfig[group.status];
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
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${plan.color}`}>
                        {t(plan.label)}
                      </span>
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
                      <p className="font-medium">{new Date(group.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("collectionRate")}</p>
                      <p className={`font-medium ${group.collectionRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : group.collectionRate >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                        {group.collectionRate}%
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {group.status === "active" ? (
                      <Button variant="outline" size="sm" className="text-xs">
                        <Ban className="mr-1.5 h-3 w-3" />
                        {t("suspendGroup")}
                      </Button>
                    ) : group.status === "suspended" ? (
                      <Button variant="outline" size="sm" className="text-xs">
                        <CheckCircle className="mr-1.5 h-3 w-3" />
                        {t("activateGroup")}
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" className="text-xs">
                      <ArrowUpDown className="mr-1.5 h-3 w-3" />
                      {t("changePlan")}
                    </Button>
                    {group.status !== "archived" && (
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
