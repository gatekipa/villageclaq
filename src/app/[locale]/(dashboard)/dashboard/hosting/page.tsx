"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Home,
  Plus,
  ArrowRightLeft,
  ShieldCheck,
  Calendar,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Star,
  Ban,
} from "lucide-react";

type HostingStatus = "upcoming" | "completed" | "missed" | "swapped" | "exempted";

interface Assignment {
  id: string;
  memberName: string;
  memberInitials: string;
  eventTitle: string;
  date: string;
  status: HostingStatus;
  exemptionReason?: string;
  swappedWith?: string;
}

interface MemberHostingStats {
  id: string;
  name: string;
  initials: string;
  timesHosted: number;
  timesMissed: number;
  fairnessScore: number;
  nextAssignment?: string;
  orderIndex: number;
}

const mockAssignments: Assignment[] = [
  { id: "1", memberName: "Jean-Pierre Kamga", memberInitials: "JK", eventTitle: "April General Assembly", date: "2026-04-28", status: "upcoming" },
  { id: "2", memberName: "Sylvie Mbarga", memberInitials: "SM", eventTitle: "May General Assembly", date: "2026-05-28", status: "upcoming" },
  { id: "3", memberName: "Emmanuel Tabi", memberInitials: "ET", eventTitle: "June General Assembly", date: "2026-06-28", status: "upcoming" },
  { id: "4", memberName: "Marie-Claire Fotso", memberInitials: "MF", eventTitle: "March General Assembly", date: "2026-03-28", status: "completed" },
  { id: "5", memberName: "Paul Ngoumou", memberInitials: "PN", eventTitle: "February General Assembly", date: "2026-02-28", status: "completed" },
  { id: "6", memberName: "Bernadette Atangana", memberInitials: "BA", eventTitle: "January General Assembly", date: "2026-01-28", status: "missed" },
  { id: "7", memberName: "Georges Tchinda", memberInitials: "GT", eventTitle: "December General Assembly", date: "2025-12-20", status: "swapped", swappedWith: "Hélène Njike" },
  { id: "8", memberName: "Hélène Njike", memberInitials: "HN", eventTitle: "November General Assembly", date: "2025-11-28", status: "exempted", exemptionReason: "Bereavement" },
];

const mockMemberStats: MemberHostingStats[] = [
  { id: "1", name: "Jean-Pierre Kamga", initials: "JK", timesHosted: 3, timesMissed: 0, fairnessScore: 95, nextAssignment: "2026-04-28", orderIndex: 1 },
  { id: "2", name: "Sylvie Mbarga", initials: "SM", timesHosted: 3, timesMissed: 0, fairnessScore: 95, nextAssignment: "2026-05-28", orderIndex: 2 },
  { id: "3", name: "Emmanuel Tabi", initials: "ET", timesHosted: 2, timesMissed: 1, fairnessScore: 75, nextAssignment: "2026-06-28", orderIndex: 3 },
  { id: "4", name: "Marie-Claire Fotso", initials: "MF", timesHosted: 3, timesMissed: 0, fairnessScore: 100, orderIndex: 4 },
  { id: "5", name: "Paul Ngoumou", initials: "PN", timesHosted: 3, timesMissed: 0, fairnessScore: 100, orderIndex: 5 },
  { id: "6", name: "Bernadette Atangana", initials: "BA", timesHosted: 1, timesMissed: 2, fairnessScore: 45, orderIndex: 6 },
  { id: "7", name: "Georges Tchinda", initials: "GT", timesHosted: 2, timesMissed: 0, fairnessScore: 90, orderIndex: 7 },
  { id: "8", name: "Hélène Njike", initials: "HN", timesHosted: 3, timesMissed: 0, fairnessScore: 85, orderIndex: 8 },
];

const hostingStatusConfig: Record<HostingStatus, { color: string; icon: typeof CheckCircle2 }> = {
  upcoming: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  missed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  swapped: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: ArrowRightLeft },
  exempted: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: ShieldCheck },
};

function getFairnessColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function HostingPage() {
  const t = useTranslations();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [showExemptDialog, setShowExemptDialog] = useState(false);
  const [tab, setTab] = useState<"schedule" | "fairness">("schedule");
  const [hasRoster] = useState(true);

  const upcomingAssignments = mockAssignments.filter((a) => a.status === "upcoming");
  const pastAssignments = mockAssignments.filter((a) => a.status !== "upcoming");

  // Next hosting for "current user"
  const myNextHosting = upcomingAssignments[0];
  const daysUntil = myNextHosting
    ? Math.ceil((new Date(myNextHosting.date).getTime() - new Date("2026-03-22").getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("hosting.title")}</h1>
          <p className="text-muted-foreground">{t("hosting.subtitle")}</p>
        </div>
        {hasRoster && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSwapDialog(true)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {t("hosting.swapHost")}
            </Button>
            <Button variant="outline" onClick={() => setShowExemptDialog(true)}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {t("hosting.exemptMember")}
            </Button>
          </div>
        )}
      </div>

      {!hasRoster ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Home className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("hosting.noRoster")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("hosting.noRosterDesc")}</p>
            <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("hosting.createRoster")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* My Next Hosting Card */}
          {myNextHosting && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <Home className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{t("hosting.myAssignment")}</h3>
                    <p className="text-sm text-muted-foreground">{myNextHosting.eventTitle}</p>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">{myNextHosting.date}</span>
                      <span className="text-primary font-semibold">
                        {daysUntil === 0
                          ? t("hosting.countdownToday")
                          : t("hosting.countdown", { days: daysUntil ?? 0 })}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setShowSwapDialog(true)}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    {t("hosting.swapHost")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <div className="flex gap-2">
            <Button
              variant={tab === "schedule" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("schedule")}
            >
              <Calendar className="mr-1 h-4 w-4" />
              {t("hosting.upcomingHosts")}
            </Button>
            <Button
              variant={tab === "fairness" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("fairness")}
            >
              <Trophy className="mr-1 h-4 w-4" />
              {t("hosting.fairnessScore")}
            </Button>
          </div>

          {/* Schedule Tab */}
          {tab === "schedule" && (
            <div className="space-y-4">
              {/* Upcoming */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("hosting.upcomingHosts")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {upcomingAssignments.map((assignment, index) => {
                      const config = hostingStatusConfig[assignment.status];
                      const StatusIcon = config.icon;
                      return (
                        <div key={assignment.id} className="flex items-center gap-3 rounded-lg border p-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                            {index + 1}
                          </div>
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {assignment.memberInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{assignment.memberName}</p>
                            <p className="text-xs text-muted-foreground">{assignment.eventTitle} · {assignment.date}</p>
                          </div>
                          <Badge className={config.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`hosting.hostingStatus.${assignment.status}`)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Past */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("hosting.pastHosts")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pastAssignments.map((assignment) => {
                      const config = hostingStatusConfig[assignment.status];
                      const StatusIcon = config.icon;
                      return (
                        <div key={assignment.id} className="flex items-center gap-3 rounded-lg border p-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {assignment.memberInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{assignment.memberName}</p>
                            <p className="text-xs text-muted-foreground">
                              {assignment.eventTitle} · {assignment.date}
                              {assignment.swappedWith && ` · Swapped with ${assignment.swappedWith}`}
                              {assignment.exemptionReason && ` · ${assignment.exemptionReason}`}
                            </p>
                          </div>
                          <Badge className={config.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`hosting.hostingStatus.${assignment.status}`)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Fairness Tab */}
          {tab === "fairness" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("hosting.fairnessScore")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockMemberStats
                    .sort((a, b) => b.fairnessScore - a.fairnessScore)
                    .map((member) => (
                      <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {member.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{member.name}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{t("hosting.timesHosted")}: {member.timesHosted}</span>
                            <span>{t("hosting.timesMissed")}: {member.timesMissed}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${getFairnessColor(member.fairnessScore)}`}>
                            {member.fairnessScore}%
                          </div>
                          <div className="text-xs text-muted-foreground">{t("hosting.fairnessScore")}</div>
                        </div>
                        {/* Fairness bar */}
                        <div className="hidden w-24 sm:block">
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                member.fairnessScore >= 80 ? "bg-emerald-500" :
                                member.fairnessScore >= 60 ? "bg-amber-500" : "bg-red-500"
                              }`}
                              style={{ width: `${member.fairnessScore}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Swap Dialog */}
      <Dialog open={showSwapDialog} onOpenChange={setShowSwapDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hosting.swapHost")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("hosting.swapWith")}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t("minutes.selectMember")} />
                </SelectTrigger>
                <SelectContent>
                  {mockMemberStats.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSwapDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowSwapDialog(false)}>{t("hosting.swapRequest")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exempt Dialog */}
      <Dialog open={showExemptDialog} onOpenChange={setShowExemptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hosting.exemptMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("contributions.member")}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t("minutes.selectMember")} />
                </SelectTrigger>
                <SelectContent>
                  {mockMemberStats.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("hosting.exemptionReason")}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t("hosting.exemptionReason")} />
                </SelectTrigger>
                <SelectContent>
                  {(["travel", "illness", "bereavement", "financial", "other"] as const).map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {t(`hosting.exemptionReasons.${reason}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExemptDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowExemptDialog(false)}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Roster Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hosting.createRoster")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("hosting.rosterName")}</Label>
              <Input placeholder="Monthly Meeting Hosting" />
            </div>
            <div className="space-y-2">
              <Label>{t("hosting.rotationType")}</Label>
              <div className="space-y-2">
                {(["sequential", "random", "manual"] as const).map((type) => (
                  <button
                    key={type}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="font-medium text-sm">{t(`hosting.${type}`)}</div>
                    <div className="text-xs text-muted-foreground">{t(`hosting.${type}Desc`)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowCreateDialog(false)}>{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
