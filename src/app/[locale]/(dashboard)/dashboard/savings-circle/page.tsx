"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CircleDollarSign,
  Plus,
  Users,
  TrendingUp,
  Clock,
  CalendarDays,
  Repeat,
  Shuffle,
  Gavel,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";

// --- Types ---

type ContributionStatus = "paid" | "pending" | "late";
type RotationType = "sequential" | "random" | "auction";
type Frequency = "weekly" | "biweekly" | "monthly";

interface Participant {
  id: string;
  name: string;
  initials: string;
  status: ContributionStatus;
}

interface CycleRound {
  roundNumber: number;
  collectorName: string;
  collectorInitials: string;
  status: "past" | "current" | "future";
}

interface SavingsCycle {
  id: string;
  name: string;
  frequency: Frequency;
  rotationType: RotationType;
  currentRound: number;
  totalRounds: number;
  potSize: string;
  potDescription: string;
  currency: string;
  collectorName: string;
  collectorInitials: string;
  paidCount: number;
  totalMembers: number;
  deadline: string;
  participants: Participant[];
  timeline: CycleRound[];
  expanded: boolean;
}

// --- Mock Data ---

const mockCycles: SavingsCycle[] = [
  {
    id: "1",
    name: "Monthly Tontine 2026",
    frequency: "monthly",
    rotationType: "sequential",
    currentRound: 4,
    totalRounds: 12,
    potSize: "XAF 600,000",
    potDescription: "12 members \u00d7 XAF 50,000",
    currency: "XAF",
    collectorName: "Marie Nguemo",
    collectorInitials: "MN",
    paidCount: 8,
    totalMembers: 12,
    deadline: "March 28, 2026",
    participants: [
      { id: "p1", name: "Jean-Pierre Kamga", initials: "JK", status: "paid" },
      { id: "p2", name: "Sylvie Mbarga", initials: "SM", status: "paid" },
      { id: "p3", name: "Emmanuel Tabi", initials: "ET", status: "paid" },
      { id: "p4", name: "Marie Nguemo", initials: "MN", status: "paid" },
      { id: "p5", name: "Paul Ngoumou", initials: "PN", status: "paid" },
      { id: "p6", name: "Bernadette Atangana", initials: "BA", status: "paid" },
      { id: "p7", name: "Georges Tchinda", initials: "GT", status: "paid" },
      { id: "p8", name: "Francois Mbassi", initials: "FM", status: "paid" },
      { id: "p9", name: "Helene Njike", initials: "HN", status: "pending" },
      { id: "p10", name: "Rosalie Edimo", initials: "RE", status: "pending" },
      { id: "p11", name: "Patrick Biyick", initials: "PB", status: "pending" },
      { id: "p12", name: "Yvonne Tchana", initials: "YT", status: "late" },
    ],
    timeline: [
      { roundNumber: 1, collectorName: "Jean-Pierre Kamga", collectorInitials: "JK", status: "past" },
      { roundNumber: 2, collectorName: "Sylvie Mbarga", collectorInitials: "SM", status: "past" },
      { roundNumber: 3, collectorName: "Emmanuel Tabi", collectorInitials: "ET", status: "past" },
      { roundNumber: 4, collectorName: "Marie Nguemo", collectorInitials: "MN", status: "current" },
      { roundNumber: 5, collectorName: "Paul Ngoumou", collectorInitials: "PN", status: "future" },
      { roundNumber: 6, collectorName: "Bernadette Atangana", collectorInitials: "BA", status: "future" },
      { roundNumber: 7, collectorName: "Georges Tchinda", collectorInitials: "GT", status: "future" },
      { roundNumber: 8, collectorName: "Francois Mbassi", collectorInitials: "FM", status: "future" },
      { roundNumber: 9, collectorName: "Helene Njike", collectorInitials: "HN", status: "future" },
      { roundNumber: 10, collectorName: "Rosalie Edimo", collectorInitials: "RE", status: "future" },
      { roundNumber: 11, collectorName: "Patrick Biyick", collectorInitials: "PB", status: "future" },
      { roundNumber: 12, collectorName: "Yvonne Tchana", collectorInitials: "YT", status: "future" },
    ],
    expanded: true,
  },
  {
    id: "2",
    name: "Weekly Susu Group",
    frequency: "weekly",
    rotationType: "random",
    currentRound: 8,
    totalRounds: 20,
    potSize: "GHS 2,000",
    potDescription: "20 members \u00d7 GHS 100",
    currency: "GHS",
    collectorName: "Kwame Asante",
    collectorInitials: "KA",
    paidCount: 15,
    totalMembers: 20,
    deadline: "March 25, 2026",
    participants: [],
    timeline: [],
    expanded: false,
  },
];

// --- Component ---

export default function SavingsCirclePage() {
  const t = useTranslations("savingsCircle");
  const [createOpen, setCreateOpen] = useState(false);

  const rotationIcon = (type: RotationType) => {
    switch (type) {
      case "sequential":
        return <Repeat className="size-3" />;
      case "random":
        return <Shuffle className="size-3" />;
      case "auction":
        return <Gavel className="size-3" />;
    }
  };

  const statusBadge = (status: ContributionStatus) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-emerald-600 text-white dark:bg-emerald-500">
            <CheckCircle2 className="size-3" />
            {t("statusPaid")}
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="size-3" />
            {t("statusPending")}
          </Badge>
        );
      case "late":
        return (
          <Badge variant="destructive">
            <XCircle className="size-3" />
            {t("statusLate")}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
          <Plus className="size-4" />
          {t("createCycle")}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CircleDollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("activeCycles")}</p>
              <p className="text-xl font-bold text-foreground">2</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("participants")}</p>
              <p className="text-xl font-bold text-foreground">24</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <TrendingUp className="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("totalCollected")}</p>
              <p className="text-xl font-bold text-foreground">XAF 3,600,000</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertCircle className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("totalPending")}</p>
              <p className="text-xl font-bold text-foreground">XAF 400,000</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Cycles */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("activeCycles")}</h2>

        {mockCycles.map((cycle) => (
          <Card key={cycle.id}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">{cycle.name}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="default" className="bg-emerald-600 text-white dark:bg-emerald-500">
                    {t("statusActive")}
                  </Badge>
                  <Badge variant="outline">{t(cycle.frequency)}</Badge>
                  <Badge variant="secondary" className="gap-1">
                    {rotationIcon(cycle.rotationType)}
                    {t(cycle.rotationType)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Cycle overview grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("currentRound")}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {cycle.currentRound} {t("of")} {cycle.totalRounds}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("potSize")}</p>
                  <p className="text-lg font-semibold text-foreground">{cycle.potSize}</p>
                  <p className="text-xs text-muted-foreground">{cycle.potDescription}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("collector")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarFallback>{cycle.collectorInitials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">{cycle.collectorName}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("deadline")}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    {cycle.deadline}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("contributedCount", { paid: cycle.paidCount, total: cycle.totalMembers })}
                  </span>
                  <span className="font-medium text-foreground">
                    {Math.round((cycle.paidCount / cycle.totalMembers) * 100)}%
                  </span>
                </div>
                <Progress value={cycle.paidCount} max={cycle.totalMembers} />
              </div>

              {/* Contribution status list (only for expanded cycle) */}
              {cycle.expanded && cycle.participants.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">{t("participants")}</h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {cycle.participants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:bg-muted/10"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarFallback>{p.initials}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-foreground">{p.name}</span>
                        </div>
                        {statusBadge(p.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rotation Timeline */}
      {mockCycles[0] && mockCycles[0].timeline.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t("rotationTimeline")}</h2>
          <Card>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">{mockCycles[0].name}</p>
              <div className="overflow-x-auto pb-2">
                <div className="flex items-center gap-2 min-w-max">
                  {mockCycles[0].timeline.map((round, idx) => (
                    <div key={round.roundNumber} className="flex items-center">
                      {/* Round node */}
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`
                            relative flex size-12 items-center justify-center rounded-full border-2 text-xs font-bold transition-all
                            ${
                              round.status === "past"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : round.status === "current"
                                  ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 dark:shadow-emerald-500/20"
                                  : "border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground dark:bg-muted/20"
                            }
                          `}
                        >
                          {round.collectorInitials}
                          {round.status === "current" && (
                            <span className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-400 opacity-30" />
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          R{round.roundNumber}
                        </span>
                        <span className="max-w-[60px] truncate text-center text-[10px] text-muted-foreground">
                          {round.collectorName.split(" ")[0]}
                        </span>
                      </div>
                      {/* Connector line */}
                      {idx < mockCycles[0].timeline.length - 1 && (
                        <div
                          className={`h-0.5 w-6 ${
                            round.status === "past" || round.status === "current"
                              ? "bg-emerald-500"
                              : "border-t-2 border-dashed border-muted-foreground/30 bg-transparent"
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-full border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30" />
                  {t("past")}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-full bg-emerald-500" />
                  {t("current")}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-full border-2 border-dashed border-muted-foreground/40" />
                  {t("future")}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Cycle Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createNewCycle")}</DialogTitle>
            <DialogDescription>{t("createNewCycleDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Cycle Name */}
            <div className="grid gap-2">
              <Label htmlFor="cycleName">{t("cycleName")}</Label>
              <Input id="cycleName" placeholder="Monthly Tontine 2026" />
            </div>

            {/* Custom Label */}
            <div className="grid gap-2">
              <Label htmlFor="customLabel">{t("customLabel")}</Label>
              <Input id="customLabel" placeholder="Tontine" />
              <p className="text-xs text-muted-foreground">{t("customLabelHint")}</p>
            </div>

            {/* Amount + Currency row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="amount">{t("amount")}</Label>
                <Input id="amount" type="number" placeholder="50000" />
              </div>
              <div className="grid gap-2">
                <Label>{t("currency")}</Label>
                <Select defaultValue="XAF">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XAF">XAF</SelectItem>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="GHS">GHS</SelectItem>
                    <SelectItem value="KES">KES</SelectItem>
                    <SelectItem value="ZAR">ZAR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Frequency */}
            <div className="grid gap-2">
              <Label>{t("frequency")}</Label>
              <Select defaultValue="monthly">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{t("weekly")}</SelectItem>
                  <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                  <SelectItem value="monthly">{t("monthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Total Rounds */}
            <div className="grid gap-2">
              <Label htmlFor="totalRounds">{t("totalRounds")}</Label>
              <Input id="totalRounds" type="number" placeholder="12" />
            </div>

            {/* Start Date */}
            <div className="grid gap-2">
              <Label htmlFor="startDate">{t("startDate")}</Label>
              <Input id="startDate" type="date" />
            </div>

            {/* Rotation Type */}
            <div className="grid gap-2">
              <Label>{t("rotationType")}</Label>
              <Select defaultValue="sequential">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">{t("sequential")}</SelectItem>
                  <SelectItem value="random">{t("random")}</SelectItem>
                  <SelectItem value="auction">{t("auction")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">
              <Plus className="size-4" />
              {t("createCycle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
