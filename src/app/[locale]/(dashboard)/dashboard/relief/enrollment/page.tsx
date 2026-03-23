"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, UserPlus, UserMinus, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface Enrollment {
  id: string;
  memberName: string;
  memberInitials: string;
  planName: string;
  enrolledAt: string;
  eligibleFrom: string;
  isEligible: boolean;
  isWaiting: boolean;
  contributionStatus: "up_to_date" | "behind";
  isActive: boolean;
}

const mockEnrollments: Enrollment[] = [
  { id: "1", memberName: "Jean-Pierre Kamga", memberInitials: "JK", planName: "Bereavement Fund", enrolledAt: "2025-06-01", eligibleFrom: "2025-12-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", isActive: true },
  { id: "2", memberName: "Sylvie Mbarga", memberInitials: "SM", planName: "Bereavement Fund", enrolledAt: "2025-06-01", eligibleFrom: "2025-12-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", isActive: true },
  { id: "3", memberName: "Emmanuel Tabi", memberInitials: "ET", planName: "Bereavement Fund", enrolledAt: "2025-06-01", eligibleFrom: "2025-12-01", isEligible: true, isWaiting: false, contributionStatus: "behind", isActive: true },
  { id: "4", memberName: "Marie-Claire Fotso", memberInitials: "MF", planName: "Health Emergency Fund", enrolledAt: "2026-01-15", eligibleFrom: "2026-04-15", isEligible: false, isWaiting: true, contributionStatus: "up_to_date", isActive: true },
  { id: "5", memberName: "Paul Ngoumou", memberInitials: "PN", planName: "Health Emergency Fund", enrolledAt: "2025-08-01", eligibleFrom: "2025-11-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", isActive: true },
  { id: "6", memberName: "Bernadette Atangana", memberInitials: "BA", planName: "Life Events Fund", enrolledAt: "2025-09-01", eligibleFrom: "2026-03-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", isActive: true },
  { id: "7", memberName: "Georges Tchinda", memberInitials: "GT", planName: "Life Events Fund", enrolledAt: "2026-02-01", eligibleFrom: "2026-08-01", isEligible: false, isWaiting: true, contributionStatus: "up_to_date", isActive: true },
  { id: "8", memberName: "François Mbassi", memberInitials: "FM", planName: "Bereavement Fund", enrolledAt: "2025-06-01", eligibleFrom: "2025-12-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", isActive: false },
];

export default function ReliefEnrollmentPage() {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const filtered = mockEnrollments.filter((e) => {
    if (planFilter !== "all" && e.planName !== planFilter) return false;
    if (search && !e.memberName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const planNames = [...new Set(mockEnrollments.map((e) => e.planName))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("relief.enrollment")}</h1>
          <p className="text-muted-foreground">{t("relief.subtitle")}</p>
        </div>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />{t("relief.enrollMember")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{mockEnrollments.filter((e) => e.isEligible && e.isActive).length}</p>
                <p className="text-xs text-muted-foreground">{t("relief.eligible")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{mockEnrollments.filter((e) => e.isWaiting).length}</p>
                <p className="text-xs text-muted-foreground">{t("relief.waiting")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{mockEnrollments.filter((e) => e.contributionStatus === "behind").length}</p>
                <p className="text-xs text-muted-foreground">{t("relief.behind")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("members.searchMembers")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={planFilter} onValueChange={(v) => v && setPlanFilter(v)}>
          <SelectTrigger className="sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {planNames.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Enrollment List */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {filtered.map((enrollment) => (
              <div key={enrollment.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">{enrollment.memberInitials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{enrollment.memberName}</p>
                    <p className="text-xs text-muted-foreground">{enrollment.planName}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    {t("relief.enrollmentDate")}: {enrollment.enrolledAt}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("relief.eligibilityDate")}: {enrollment.eligibleFrom}
                  </div>
                  {enrollment.isWaiting ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      <Clock className="mr-1 h-3 w-3" />{t("relief.waiting")}
                    </Badge>
                  ) : enrollment.isEligible ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <CheckCircle2 className="mr-1 h-3 w-3" />{t("relief.eligible")}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">{t("relief.ineligible")}</Badge>
                  )}
                  <Badge variant={enrollment.contributionStatus === "up_to_date" ? "outline" : "destructive"}>
                    {enrollment.contributionStatus === "up_to_date" ? t("relief.upToDate") : t("relief.behind")}
                  </Badge>
                  {!enrollment.isActive && (
                    <Badge variant="secondary">{t("common.inactive")}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
