"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Shield,
  HandCoins,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MoreVertical,
  Edit,
  UserMinus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock member data
const member = {
  id: "1",
  name: "Jean-Pierre Kamga",
  displayName: "JP",
  email: "jp.kamga@email.com",
  phone: "+237 677 123 456",
  role: "admin",
  position: "Vice President",
  standing: "good" as const,
  joinedAt: "2024-01-15",
  lastActive: "2026-03-20",
  isProxy: false,
  stats: {
    meetingsAttended: 18,
    meetingsTotal: 22,
    contributionsPaid: 14,
    contributionsTotal: 14,
    outstandingBalance: 0,
  },
};

const contributionHistory = [
  { id: "1", date: "2026-03-15", amount: 15000, currency: "XAF", status: "paid", type: "Monthly Dues" },
  { id: "2", date: "2026-02-15", amount: 15000, currency: "XAF", status: "paid", type: "Monthly Dues" },
  { id: "3", date: "2026-01-15", amount: 15000, currency: "XAF", status: "paid", type: "Monthly Dues" },
  { id: "4", date: "2025-12-15", amount: 15000, currency: "XAF", status: "paid", type: "Monthly Dues" },
  { id: "5", date: "2025-11-15", amount: 15000, currency: "XAF", status: "paid", type: "Monthly Dues" },
  { id: "6", date: "2025-10-15", amount: 25000, currency: "XAF", status: "paid", type: "Special Levy" },
];

const attendanceHistory = [
  { id: "1", date: "2026-03-15", title: "Monthly General Assembly", attended: true },
  { id: "2", date: "2026-02-15", title: "Monthly General Assembly", attended: true },
  { id: "3", date: "2026-01-18", title: "Monthly General Assembly", attended: false },
  { id: "4", date: "2025-12-20", title: "End of Year Assembly", attended: true },
  { id: "5", date: "2025-12-05", title: "Emergency Board Meeting", attended: true },
  { id: "6", date: "2025-11-15", title: "Monthly General Assembly", attended: true },
];

const positionHistory = [
  { id: "1", title: "Vice President", startDate: "2025-01-01", endDate: null },
  { id: "2", title: "Board Member", startDate: "2024-06-01", endDate: "2024-12-31" },
  { id: "3", title: "Member", startDate: "2024-01-15", endDate: "2024-05-31" },
];

const standingStyles = {
  good: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  warning: { bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500" },
  suspended: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  banned: { bg: "bg-red-900/10", text: "text-red-900 dark:text-red-300", dot: "bg-red-900" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function MemberDetailPage() {
  const t = useTranslations();
  const style = standingStyles[member.standing];
  const attendanceRate = Math.round((member.stats.meetingsAttended / member.stats.meetingsTotal) * 100);

  return (
    <div className="space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/members" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="flex items-center gap-2">
              <Edit className="h-4 w-4" /> {t("members.editRole")}
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> {t("members.changeStanding")}
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> {t("members.assignPosition")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex items-center gap-2 text-destructive">
              <UserMinus className="h-4 w-4" /> {t("members.removeMember")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Member Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20" size="lg">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {member.name.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-xl font-bold">{member.name}</h1>
              {member.position && (
                <p className="text-sm font-medium text-primary">{member.position}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  {t(`members.standing${member.standing.charAt(0).toUpperCase() + member.standing.slice(1)}` as "members.standingGood")}
                </span>
                <Badge variant="secondary">{t(`roles.${member.role}` as "roles.admin")}</Badge>
              </div>
              {/* Contact info */}
              <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-4">
                {member.email && (
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{member.email}</span>
                )}
                {member.phone && (
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{member.phone}</span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("members.joinedDate")}: {new Date(member.joinedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{attendanceRate}%</p>
              <p className="text-xs text-muted-foreground">{t("members.meetingsAttended")}</p>
              <p className="text-[11px] text-muted-foreground">{member.stats.meetingsAttended}/{member.stats.meetingsTotal}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <HandCoins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{member.stats.contributionsPaid}/{member.stats.contributionsTotal}</p>
              <p className="text-xs text-muted-foreground">{t("members.contributionsPaid")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${member.stats.outstandingBalance > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
              <AlertTriangle className={`h-5 w-5 ${member.stats.outstandingBalance > 0 ? "text-destructive" : "text-primary"}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${member.stats.outstandingBalance > 0 ? "text-destructive" : ""}`}>
                {formatCurrency(member.stats.outstandingBalance, "XAF")}
              </p>
              <p className="text-xs text-muted-foreground">{t("members.outstandingBalance")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Tabs */}
      <Tabs defaultValue="contributions">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="contributions">{t("members.contributionHistory")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("members.attendanceRecord")}</TabsTrigger>
          <TabsTrigger value="positions">{t("members.positionHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="contributions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {contributionHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{item.type}</p>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {formatCurrency(item.amount, item.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {attendanceHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.attended ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                    </div>
                    <Badge variant={item.attended ? "secondary" : "destructive"}>
                      {item.attended ? "Present" : "Absent"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {positionHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.startDate} — {item.endDate || "Present"}
                        </p>
                      </div>
                    </div>
                    {!item.endDate && <Badge>{t("common.active")}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
