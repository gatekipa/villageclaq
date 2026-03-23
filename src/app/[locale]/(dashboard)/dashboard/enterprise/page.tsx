"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

interface Branch {
  id: string;
  name: string;
  city: string;
  country: string;
  currency: string;
  members: number;
  collectionRate: number;
  attendanceRate: number;
  eventsHeld: number;
  healthScore: number;
  alerts: string[];
  lastActive: string;
}

const mockBranches: Branch[] = [
  { id: "1", name: "Douala Chapter", city: "Douala", country: "Cameroon", currency: "XAF", members: 47, collectionRate: 82, attendanceRate: 84, eventsHeld: 12, healthScore: 88, alerts: [], lastActive: "2026-03-22" },
  { id: "2", name: "Yaoundé Chapter", city: "Yaoundé", country: "Cameroon", currency: "XAF", members: 35, collectionRate: 75, attendanceRate: 78, eventsHeld: 10, healthScore: 76, alerts: [], lastActive: "2026-03-20" },
  { id: "3", name: "Paris Chapter", city: "Paris", country: "France", currency: "EUR", members: 22, collectionRate: 90, attendanceRate: 65, eventsHeld: 8, healthScore: 72, alerts: ["alertLowAttendance"], lastActive: "2026-03-18" },
  { id: "4", name: "Maryland Chapter", city: "Silver Spring", country: "USA", currency: "USD", members: 18, collectionRate: 45, attendanceRate: 55, eventsHeld: 5, healthScore: 42, alerts: ["alertLowCollection", "alertLowAttendance"], lastActive: "2026-03-10" },
  { id: "5", name: "Bamenda Chapter", city: "Bamenda", country: "Cameroon", currency: "XAF", members: 15, collectionRate: 68, attendanceRate: 72, eventsHeld: 6, healthScore: 65, alerts: [], lastActive: "2026-02-15" },
];

const totalStats = {
  branches: mockBranches.length,
  members: mockBranches.reduce((a, b) => a + b.members, 0),
  avgCollection: Math.round(mockBranches.reduce((a, b) => a + b.collectionRate, 0) / mockBranches.length),
  totalOutstanding: 1250000,
};

function healthColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function healthBg(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "XAF", minimumFractionDigits: 0 }).format(amount);
}

export default function EnterpriseDashboardPage() {
  const t = useTranslations();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSharingDialog, setShowSharingDialog] = useState(false);
  const [sharing, setSharing] = useState({ memberCount: true, financialSummary: true, detailedTransactions: false, attendance: true, events: true, minutes: false, relief: false });

  const alertBranches = mockBranches.filter((b) => b.alerts.length > 0);

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
        </CardHeader><CardContent><div className="text-3xl font-bold">{totalStats.branches}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.totalMembers")}</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader><CardContent><div className="text-3xl font-bold">{totalStats.members}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.combinedCollectionRate")}</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader><CardContent><div className="text-3xl font-bold text-primary">{totalStats.avgCollection}%</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("enterprise.combinedOutstanding")}</CardTitle>
          <DollarSign className="h-4 w-4 text-destructive" />
        </CardHeader><CardContent><div className="text-3xl font-bold text-destructive">{formatCurrency(totalStats.totalOutstanding)}</div></CardContent></Card>
      </div>

      {/* Health Alerts */}
      {alertBranches.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-base text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("enterprise.healthAlerts")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alertBranches.map((branch) => (
                <div key={branch.id} className="flex flex-col gap-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.city}, {branch.country}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {branch.alerts.map((alert) => (
                      <Badge key={alert} variant="destructive" className="text-xs">{t(`enterprise.${alert}`)}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Branch List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("enterprise.branchHealth")}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowSharingDialog(true)}>
            <Shield className="mr-1 h-3.5 w-3.5" />{t("enterprise.sharingControls")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockBranches.sort((a, b) => b.healthScore - a.healthScore).map((branch) => (
              <div key={branch.id} className="rounded-lg border p-4 transition-shadow hover:shadow-md">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <span className={`text-xl font-bold ${healthColor(branch.healthScore)}`}>{branch.healthScore}</span>
                    </div>
                    <div>
                      <p className="font-semibold">{branch.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />{branch.city}, {branch.country} · {branch.currency}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="grid grid-cols-4 gap-3 text-center text-xs">
                      <div><p className="font-bold">{branch.members}</p><p className="text-muted-foreground">{t("enterprise.memberCount")}</p></div>
                      <div><p className="font-bold">{branch.collectionRate}%</p><p className="text-muted-foreground">{t("enterprise.collectionRate")}</p></div>
                      <div><p className="font-bold">{branch.attendanceRate}%</p><p className="text-muted-foreground">{t("enterprise.attendanceRate")}</p></div>
                      <div><p className="font-bold">{branch.eventsHeld}</p><p className="text-muted-foreground">{t("enterprise.eventsHeld")}</p></div>
                    </div>
                    <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <div className={`h-1.5 rounded-full ${healthBg(branch.healthScore)}`} style={{ width: `${branch.healthScore}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
