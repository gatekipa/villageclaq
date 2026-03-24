"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const supabase = createClient();

const standingStyles = {
  good: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  warning: { bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500" },
  suspended: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  banned: { bg: "bg-red-900/10", text: "text-red-900 dark:text-red-300", dot: "bg-red-900" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function useMemberDetail(membershipId: string | null) {
  return useQuery({
    queryKey: ["member-detail", membershipId],
    queryFn: async () => {
      if (!membershipId) return null;
      const { data, error } = await supabase
        .from("memberships")
        .select("*, profiles!memberships_user_id_fkey(id, full_name, avatar_url, phone, preferred_locale)")
        .eq("id", membershipId)
        .single();
      if (error) throw error;
      return {
        ...data,
        profile: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles,
      };
    },
    enabled: !!membershipId,
  });
}

function useMemberPayments(membershipId: string | null, groupId: string | null) {
  return useQuery({
    queryKey: ["member-payments", membershipId],
    queryFn: async () => {
      if (!membershipId || !groupId) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*, contribution_type:contribution_types(id, name, name_fr)")
        .eq("membership_id", membershipId)
        .eq("group_id", groupId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId && !!groupId,
  });
}

function useMemberAttendance(membershipId: string | null) {
  return useQuery({
    queryKey: ["member-attendance", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("event_attendances")
        .select("*, event:events!inner(id, title, title_fr, starts_at)")
        .eq("membership_id", membershipId)
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

function useMemberPositions(membershipId: string | null) {
  return useQuery({
    queryKey: ["member-positions", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("position_assignments")
        .select("*, position:group_positions!inner(id, title, title_fr)")
        .eq("membership_id", membershipId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

function useMemberObligations(membershipId: string | null, groupId: string | null) {
  return useQuery({
    queryKey: ["member-obligations", membershipId],
    queryFn: async () => {
      if (!membershipId || !groupId) return [];
      const { data, error } = await supabase
        .from("contribution_obligations")
        .select("amount, amount_paid, status")
        .eq("membership_id", membershipId)
        .eq("group_id", groupId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId && !!groupId,
  });
}

export default function MemberDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const membershipId = params.id as string;
  const { groupId, isAdmin, currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";

  const { data: member, isLoading: memberLoading, error: memberError } = useMemberDetail(membershipId);
  const { data: payments = [], isLoading: paymentsLoading } = useMemberPayments(membershipId, groupId);
  const { data: attendances = [], isLoading: attendanceLoading } = useMemberAttendance(membershipId);
  const { data: positions = [], isLoading: positionsLoading } = useMemberPositions(membershipId);
  const { data: obligations = [] } = useMemberObligations(membershipId, groupId);

  // Compute stats from real data
  const totalAttendances = attendances.length;
  const presentCount = attendances.filter((a: Record<string, unknown>) => a.status === "present" || a.status === "late").length;
  const attendanceRate = totalAttendances > 0 ? Math.round((presentCount / totalAttendances) * 100) : 0;

  const totalObligations = obligations.length;
  const paidObligations = obligations.filter((o: Record<string, unknown>) => o.status === "paid").length;
  const outstandingBalance = obligations.reduce((sum: number, o: Record<string, unknown>) => sum + (Number(o.amount) - Number(o.amount_paid)), 0);

  // Loading state
  if (memberLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // Error state
  if (memberError || !member) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">{t("common.error")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("members.memberNotFound")}</p>
        <Link href="/dashboard/members" className="mt-4 text-sm text-primary hover:underline">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  const profile = member.profile as Record<string, unknown> | undefined;
  const memberName = (member.display_name || (profile?.full_name as string) || "?") as string;
  const standing = (member.standing || "good") as keyof typeof standingStyles;
  const style = standingStyles[standing] || standingStyles.good;
  const privacySettings = (member.privacy_settings || {}) as Record<string, boolean>;
  const activePosition = positions.find((p: Record<string, unknown>) => !p.ended_at);

  return (
    <div className="space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/members" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </Link>
        {isAdmin && (
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
        )}
      </div>

      {/* Member Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url as string} alt={memberName} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {memberName.split(" ").map((n: string) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-xl font-bold">{memberName}</h1>
              {activePosition && (
                <p className="text-sm font-medium text-primary">
                  {((activePosition.position as Record<string, unknown>)?.title as string) || ""}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  {t(`members.standing${standing.charAt(0).toUpperCase() + standing.slice(1)}` as "members.standingGood")}
                </span>
                <Badge variant="secondary">{t(`roles.${member.role}` as "roles.admin")}</Badge>
              </div>
              {/* Contact info - respect privacy */}
              <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-4">
                {privacySettings.show_phone && profile?.phone ? (
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{profile.phone as string}</span>
                ) : null}
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("members.joinedDate")}: {new Date(member.joined_at).toLocaleDateString()}
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
              <p className="text-[11px] text-muted-foreground">{presentCount}/{totalAttendances}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <HandCoins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{paidObligations}/{totalObligations}</p>
              <p className="text-xs text-muted-foreground">{t("members.contributionsPaid")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${outstandingBalance > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
              <AlertTriangle className={`h-5 w-5 ${outstandingBalance > 0 ? "text-destructive" : "text-primary"}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${outstandingBalance > 0 ? "text-destructive" : ""}`}>
                {formatCurrency(outstandingBalance, currency)}
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
              {paymentsLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <HandCoins className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">{t("members.noContributions")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {payments.map((item: Record<string, unknown>) => {
                    const contribType = item.contribution_type as Record<string, unknown> | null;
                    return (
                      <div key={item.id as string} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{(contribType?.name as string) || t("members.contributionHistory")}</p>
                            <p className="text-xs text-muted-foreground">{new Date(item.recorded_at as string).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-primary">
                          {formatCurrency(Number(item.amount), (item.currency as string) || currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {attendanceLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : attendances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">{t("members.noAttendance")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {attendances.map((item: Record<string, unknown>) => {
                    const event = item.event as Record<string, unknown> | null;
                    const isPresent = item.status === "present" || item.status === "late";
                    return (
                      <div key={item.id as string} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          {isPresent ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{(event?.title as string) || ""}</p>
                            <p className="text-xs text-muted-foreground">
                              {event?.starts_at ? new Date(event.starts_at as string).toLocaleDateString() : ""}
                            </p>
                          </div>
                        </div>
                        <Badge variant={isPresent ? "secondary" : "destructive"}>
                          {t(`myAttendance.status.${item.status as string}` as "myAttendance.status.present")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {positionsLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : positions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Shield className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">{t("members.noPositions")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {positions.map((item: Record<string, unknown>) => {
                    const pos = item.position as Record<string, unknown> | null;
                    return (
                      <div key={item.id as string} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{(pos?.title as string) || ""}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.started_at as string).toLocaleDateString()} — {item.ended_at ? new Date(item.ended_at as string).toLocaleDateString() : t("common.active")}
                            </p>
                          </div>
                        </div>
                        {!item.ended_at && <Badge>{t("common.active")}</Badge>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
