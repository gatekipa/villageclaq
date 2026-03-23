"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GitBranch,
  Plus,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  MapPin,
  Activity,
  Calendar,
  BarChart3,
  Shield,
  ArrowRightLeft,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

const supabase = createClient();

function useEnterpriseBranches() {
  const { currentGroup } = useGroup();
  const orgId = currentGroup?.id;
  return useQuery({
    queryKey: ["enterprise-branches", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      // Query all groups that share the same parent org or slug prefix
      // For now, query all groups the user has membership in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("memberships")
        .select("group_id, role, group:groups!inner(id, name, slug, group_type, currency, locale, logo_url, settings, sharing_controls)")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      // Get member counts for each group
      const groups = (data || []).map((m: Record<string, unknown>) => ({
        ...(Array.isArray(m.group) ? m.group[0] : m.group) as Record<string, unknown>,
        role: m.role,
      }));
      // Get member counts
      const groupIds = groups.map((g: Record<string, unknown>) => g.id as string);
      const counts: Record<string, number> = {};
      for (const gid of groupIds) {
        const { count } = await supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("group_id", gid);
        counts[gid] = count || 0;
      }
      return groups.map((g: Record<string, unknown>) => ({
        ...g,
        memberCount: counts[g.id as string] || 0,
      }));
    },
    enabled: !!orgId,
  });
}

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function EnterpriseDashboardPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const { data: branches, isLoading, error, refetch } = useEnterpriseBranches();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSharingDialog, setShowSharingDialog] = useState(false);
  const [sharing, setSharing] = useState({ memberCount: true, financialSummary: true, detailedTransactions: false, attendance: true, events: true, minutes: false, relief: false });

  if (isLoading) return <CardGridSkeleton cards={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const branchList = branches || [];
  const totalMembers = branchList.reduce((a: number, b: Record<string, unknown>) => a + ((b.memberCount as number) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("enterprise.title")}</h1>
          <p className="text-muted-foreground">{t("enterprise.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/enterprise/transfers">
            <Button variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />{t("enterprise.memberTransfer")}</Button>
          </Link>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />{t("enterprise.createBranch")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.totalBranches")}</CardTitle>
          <GitBranch className="h-4 w-4 text-muted-foreground" />
        </CardHeader><CardContent><div className="text-3xl font-bold">{branchList.length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.totalMembers")}</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader><CardContent><div className="text-3xl font-bold">{totalMembers}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.combinedCollectionRate")}</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader><CardContent><div className="text-3xl font-bold text-primary">--</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.combinedOutstanding")}</CardTitle>
          <DollarSign className="h-4 w-4 text-destructive" />
        </CardHeader><CardContent><div className="text-3xl font-bold text-destructive">--</div></CardContent></Card>
      </div>

      {/* Branch List */}
      {branchList.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={t("enterprise.title")}
          description={t("enterprise.subtitle")}
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />{t("enterprise.createBranch")}
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("enterprise.branchHealth")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowSharingDialog(true)}>
              <Shield className="mr-1 h-3.5 w-3.5" />{t("enterprise.sharingControls")}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {branchList.map((branch: Record<string, unknown>) => (
                <div key={branch.id as string} className="rounded-lg border p-4 transition-shadow hover:shadow-md">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{branch.name as string}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />{(branch.currency as string) || "XAF"} · {(branch.group_type as string) || ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center text-xs">
                        <p className="font-bold">{(branch.memberCount as number) || 0}</p>
                        <p className="text-muted-foreground">{t("enterprise.memberCount")}</p>
                      </div>
                      <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Branch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("enterprise.createBranch")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("enterprise.branchName")}</Label><Input placeholder="Douala Chapter" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>{t("enterprise.branchCity")}</Label><Input placeholder="Douala" /></div>
              <div className="space-y-2"><Label>{t("enterprise.branchCountry")}</Label><Input placeholder="Cameroon" /></div>
            </div>
            <div className="space-y-2"><Label>{t("enterprise.branchCurrency")}</Label><Input placeholder="XAF" /></div>
            <div className="space-y-2"><Label>{t("enterprise.foundingPresident")}</Label><Input placeholder="Jean-Pierre Kamga" /></div>
            <div className="space-y-2"><Label>{t("enterprise.presidentEmail")}</Label><Input type="email" placeholder="president@example.com" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowCreateDialog(false)}>{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sharing Controls Dialog */}
      <Dialog open={showSharingDialog} onOpenChange={setShowSharingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("enterprise.sharingControls")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([
              ["memberCount", "sharingMemberCount"],
              ["financialSummary", "sharingFinancialSummary"],
              ["detailedTransactions", "sharingDetailedTransactions"],
              ["attendance", "sharingAttendance"],
              ["events", "sharingEvents"],
              ["minutes", "sharingMinutes"],
              ["relief", "sharingRelief"],
            ] as const).map(([key, labelKey]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">{t(`enterprise.${labelKey}`)}</span>
                <Switch checked={sharing[key as keyof typeof sharing]} onCheckedChange={(v) => setSharing({ ...sharing, [key]: v })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSharingDialog(false)}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
