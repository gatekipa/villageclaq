"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput, getDefaultCountryCode } from "@/components/ui/phone-input";
import { useMemberStandingDetailed } from "@/lib/hooks/use-member-standing";
import { calculateStanding } from "@/lib/calculate-standing";
import { PermissionGate } from "@/components/ui/permission-gate";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { formatAmount } from "@/lib/currencies";
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
  Loader2,
  Pencil,
  RefreshCw,
  CreditCard,
  Bell,
  History,
  Home,
  Heart,
  Activity,
  HelpCircle,
  Contact,
  Trash2,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const supabase = createClient();

const standingStyles = {
  good: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    banner: "bg-emerald-500/15 border-emerald-500/30",
    bannerText: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-700 dark:text-yellow-400",
    dot: "bg-yellow-500",
    banner: "bg-yellow-500/15 border-yellow-500/30",
    bannerText: "text-yellow-700 dark:text-yellow-300",
  },
  suspended: {
    bg: "bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    banner: "bg-red-500/15 border-red-500/30",
    bannerText: "text-red-700 dark:text-red-300",
  },
  banned: {
    bg: "bg-red-900/10",
    text: "text-red-900 dark:text-red-300",
    dot: "bg-red-900",
    banner: "bg-red-900/15 border-red-900/30",
    bannerText: "text-red-900 dark:text-red-300",
  },
};

// ─── Data hooks ──────────────────────────────────────────────────────────────

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
        .select("*, contribution_type:contribution_types(id, name, name_fr)")
        .eq("membership_id", membershipId)
        .eq("group_id", groupId)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId && !!groupId,
  });
}

function useMemberHosting(membershipId: string | null) {
  return useQuery({
    queryKey: ["member-hosting", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("hosting_assignments")
        .select("id, status, assigned_date, roster:hosting_rosters(name)")
        .eq("membership_id", membershipId)
        .order("assigned_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

function useMemberRelief(membershipId: string | null) {
  return useQuery({
    queryKey: ["member-relief", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("id, contribution_status, eligibility_status, is_active, relief_plan:relief_plans(id, name, name_fr)")
        .eq("membership_id", membershipId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

function useMemberFamily(membershipId: string | null) {
  return useQuery({
    queryKey: ["member-family", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("family_members")
        .select("id, name, relationship, date_of_birth, notes")
        .eq("membership_id", membershipId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MemberDetailPage() {
  const t = useTranslations();
  const ts = useTranslations("standing");
  const th = useTranslations("helpTips");
  const locale = useLocale();
  const params = useParams();
  const membershipId = params.id as string;
  const { groupId, currentGroup, user } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const { hasPermission, isOwner } = usePermissions();
  const currency = currentGroup?.currency || "XAF";
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showStandingDialog, setShowStandingDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newStanding, setNewStanding] = useState("");

  // Action error
  const [actionError, setActionError] = useState<string | null>(null);
  function showError(msg: string) { setActionError(msg); setTimeout(() => setActionError(null), 5000); }
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<{ assignmentId: string; positionTitle: string } | null>(null);
  const [unassigningSaving, setUnassigningSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Family dialog state
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<{ id: string; name: string; relationship: string; date_of_birth: string | null; notes: string | null } | null>(null);
  const [familyName, setFamilyName] = useState("");
  const [familyRelationship, setFamilyRelationship] = useState("spouse");
  const [familyDob, setFamilyDob] = useState("");
  const [familyNotes, setFamilyNotes] = useState("");
  const [familySaving, setFamilySaving] = useState(false);
  const [deletingFamilyId, setDeletingFamilyId] = useState<string | null>(null);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStanding, setEditStanding] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Data queries
  const { data: member, isLoading: memberLoading, error: memberError } = useMemberDetail(membershipId);
  const { data: standingData, refetch: refetchStanding } = useMemberStandingDetailed(membershipId, groupId, currentGroup?.currency);
  const { data: payments = [] } = useMemberPayments(membershipId, groupId);
  const { data: attendances = [] } = useMemberAttendance(membershipId);
  const { data: positions = [] } = useMemberPositions(membershipId);
  const { data: obligations = [] } = useMemberObligations(membershipId, groupId);
  const { data: hostingAssignments = [] } = useMemberHosting(membershipId);
  const { data: reliefEnrollments = [] } = useMemberRelief(membershipId);
  const { data: familyMembers = [] } = useMemberFamily(membershipId);

  // ─── Handlers ────────────────────────────────────────────────────────────

  function openEditDialog() {
    if (!member) return;
    const prof = member.profile as Record<string, unknown> | undefined;
    const isProxy = member.is_proxy as boolean;
    const privSettings = member.privacy_settings as Record<string, unknown> | null;
    setEditDisplayName((member.display_name as string) || (prof?.full_name as string) || "");
    setEditTitle("");
    setEditEmail("");
    setEditPhone(isProxy ? ((privSettings?.proxy_phone as string) || "") : ((prof?.phone as string) || ""));
    setEditRole((member.role as string) || "member");
    setEditStanding((member.standing as string) || "good");
    setEditError(null);
    setShowEditDialog(true);
  }

  async function handleEditMember() {
    if (!member || !editDisplayName.trim()) return;
    setActionSaving(true);
    setEditError(null);
    try {
      const isProxy = member.is_proxy as boolean;
      const prof = member.profile as Record<string, unknown> | undefined;
      const userId = prof?.id as string | undefined;

      const membershipUpdate: Record<string, unknown> = {
        role: editRole,
        standing: editStanding,
        display_name: editDisplayName.trim(),
      };

      if (isProxy) {
        membershipUpdate.privacy_settings = {
          proxy_phone: editPhone || "",
          proxy_name: editDisplayName.trim(),
          show_phone: false,
          show_email: false,
        };
      }

      const { error: membershipErr } = await supabase
        .from("memberships")
        .update(membershipUpdate)
        .eq("id", membershipId);
      if (membershipErr) throw new Error(membershipErr.message);

      if (!isProxy && userId) {
        const profileUpdate: Record<string, unknown> = {
          full_name: editDisplayName.trim(),
        };
        if (editPhone !== undefined) profileUpdate.phone = editPhone || null;
        const { error: profileErr } = await supabase
          .from("profiles")
          .update(profileUpdate)
          .eq("id", userId);
        if (profileErr) throw new Error(profileErr.message);
      }

      await queryClient.invalidateQueries({ queryKey: ["member-detail", membershipId] });
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      setShowEditDialog(false);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setActionSaving(false);
    }
  }

  async function handleRecalculate() {
    if (!membershipId || !groupId) return;
    setRecalculating(true);
    try {
      await calculateStanding(membershipId, groupId, { updateDb: true });
      await refetchStanding();
      await queryClient.invalidateQueries({ queryKey: ["member-detail", membershipId] });
    } finally {
      setRecalculating(false);
    }
  }

  async function handleUnassignPosition() {
    if (!unassignTarget) return;
    setUnassigningSaving(true);
    try {
      const { error } = await supabase
        .from("position_assignments")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", unassignTarget.assignmentId)
        .is("ended_at", null);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["member-positions", membershipId] });
      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
      setUnassignTarget(null);
    } catch (err) {
      showError((err as Error).message || t("common.error"));
    } finally {
      setUnassigningSaving(false);
    }
  }

  async function handleStandingOverride() {
    if (!newStanding) return;
    setActionSaving(true);
    try {
      const { error } = await supabase.from("memberships").update({ standing: newStanding }).eq("id", membershipId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["member-detail", membershipId] });
      await queryClient.invalidateQueries({ queryKey: ["member-standing", membershipId, groupId] });
      setShowStandingDialog(false);
    } catch (err) {
      showError((err as Error).message || t("common.error"));
    } finally {
      setActionSaving(false);
    }
  }

  // ─── Family handlers ─────────────────────────────────────────────────────

  function openFamilyDialog(fm?: { id: string; name: string; relationship: string; date_of_birth: string | null; notes: string | null }) {
    if (fm) {
      setEditingFamily(fm);
      setFamilyName(fm.name);
      setFamilyRelationship(fm.relationship);
      setFamilyDob(fm.date_of_birth || "");
      setFamilyNotes(fm.notes || "");
    } else {
      setEditingFamily(null);
      setFamilyName("");
      setFamilyRelationship("spouse");
      setFamilyDob("");
      setFamilyNotes("");
    }
    setFamilyDialogOpen(true);
  }

  async function handleSaveFamily() {
    if (!familyName.trim() || !membershipId) return;
    setFamilySaving(true);
    try {
      const payload = {
        membership_id: membershipId,
        name: familyName.trim(),
        relationship: familyRelationship,
        date_of_birth: familyDob || null,
        notes: familyNotes.trim() || null,
      };
      if (editingFamily) {
        const { error } = await supabase.from("family_members").update(payload).eq("id", editingFamily.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("family_members").insert(payload);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["member-family", membershipId] });
      setFamilyDialogOpen(false);
    } catch (err) {
      showError((err as Error).message || t("common.error"));
    } finally {
      setFamilySaving(false);
    }
  }

  async function handleDeleteFamily(fm: { id: string; name: string }) {
    if (!confirm(t("members.deleteFamilyMemberConfirm", { name: fm.name }))) return;
    setDeletingFamilyId(fm.id);
    try {
      const { error } = await supabase.from("family_members").delete().eq("id", fm.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["member-family", membershipId] });
    } catch (err) {
      showError((err as Error).message || t("common.error"));
    } finally {
      setDeletingFamilyId(null);
    }
  }

  // ─── Computed stats ──────────────────────────────────────────────────────

  const totalAttendances = attendances.length;
  const presentCount = attendances.filter((a: Record<string, unknown>) => a.status === "present" || a.status === "late").length;
  const absentCount = attendances.filter((a: Record<string, unknown>) => a.status === "absent").length;
  const excusedCount = attendances.filter((a: Record<string, unknown>) => a.status === "excused").length;
  const attendanceRate = totalAttendances > 0 ? Math.round((presentCount / totalAttendances) * 100) : 0;

  // Current streak
  let currentStreak = 0;
  const sortedAttendances = [...attendances].sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(b.checked_in_at as string).getTime() - new Date(a.checked_in_at as string).getTime()
  );
  for (const a of sortedAttendances) {
    const att = a as Record<string, unknown>;
    if (att.status === "present" || att.status === "late") currentStreak++;
    else break;
  }

  const totalOutstandingAmount = obligations.reduce((sum: number, o: Record<string, unknown>) => {
    if (o.status === "paid" || o.status === "waived") return sum;
    return sum + (Number(o.amount) - Number(o.amount_paid));
  }, 0);

  const totalPaidAllTime = payments.reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount), 0);
  const lastPayment = payments[0] as Record<string, unknown> | undefined;

  // Hosting stats
  const timesHosted = hostingAssignments.filter((h: Record<string, unknown>) => h.status === "completed").length;
  const timesMissed = hostingAssignments.filter((h: Record<string, unknown>) => h.status === "missed").length;
  const hostingTotal = timesHosted + timesMissed;
  const complianceScore = hostingTotal > 0 ? Math.round((timesHosted / hostingTotal) * 100) : 100;
  const nextHosting = hostingAssignments.find((h: Record<string, unknown>) => h.status === "upcoming") as Record<string, unknown> | undefined;

  // Year-over-year mini matrix
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const oblsByTypeAndYear = new Map<string, Map<number, { status: string }>>();
  for (const obl of obligations as Array<Record<string, unknown>>) {
    const ct = obl.contribution_type as Record<string, unknown> | null;
    const typeName = (ct?.name as string) || "Other";
    const dueYear = new Date(obl.due_date as string).getFullYear();
    if (!years.includes(dueYear)) continue;
    if (!oblsByTypeAndYear.has(typeName)) oblsByTypeAndYear.set(typeName, new Map());
    oblsByTypeAndYear.get(typeName)!.set(dueYear, { status: obl.status as string });
  }

  // ─── Loading / Error states ──────────────────────────────────────────────

  if (memberLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

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
  const memberName = getMemberName(member as Record<string, unknown>);
  const standing = (standingData?.standing || member.standing || "good") as keyof typeof standingStyles;
  const style = standingStyles[standing] || standingStyles.good;
  const activePositions = positions.filter((p: Record<string, unknown>) => !p.ended_at);
  const joinedAt = member.joined_at as string;
  const yearsOfMembership = joinedAt ? Math.floor((Date.now() - new Date(joinedAt).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Error notification */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto text-destructive/70 hover:text-destructive">✕</button>
        </div>
      )}

      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/members" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </Link>
        <div className="flex items-center gap-2">
          {hasPermission("members.manage") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculate}
              disabled={recalculating}
            >
              {recalculating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              {ts("recalculateStanding")}
            </Button>
          )}
          {hasPermission("members.manage") && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="flex items-center gap-2" onClick={() => openEditDialog()}>
                  <Pencil className="h-4 w-4" /> {t("members.editMember")}
                </DropdownMenuItem>
                {(member?.role as string) !== "owner" && (
                  <DropdownMenuItem className="flex items-center gap-2" onClick={() => { setNewRole(member.role as string); setShowRoleDialog(true); }}>
                    <Edit className="h-4 w-4" /> {t("members.editRole")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="flex items-center gap-2" onClick={() => { setNewStanding(member.standing as string || "good"); setOverrideReason(""); setShowStandingDialog(true); }}>
                  <Shield className="h-4 w-4" /> {ts("changeStandingOverride")}
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2" onClick={() => setShowPositionDialog(true)}>
                  <Shield className="h-4 w-4" /> {t("members.assignPosition")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex items-center gap-2 text-destructive" onClick={() => setShowRemoveDialog(true)}>
                  <UserMinus className="h-4 w-4" /> {t("members.removeMember")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ═══════════════════════ SECTION 1: HEADER ═══════════════════════ */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url as string} alt={memberName} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {memberName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-xl font-bold">{memberName}</h1>
              {/* Position badges */}
              {activePositions.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                  {activePositions.map((p: Record<string, unknown>) => {
                    const pos = p.position as Record<string, unknown>;
                    const posTitle = (pos?.title as string) || "";
                    return (
                      <Badge key={p.id as string} variant="default" className="text-xs flex items-center gap-1 pr-1">
                        {posTitle}
                        {hasPermission("roles.manage") && (
                          <button
                            type="button"
                            className="ml-0.5 rounded-full p-0.5 hover:bg-background/20 transition-colors"
                            onClick={() => setUnassignTarget({ assignmentId: p.id as string, positionTitle: posTitle })}
                            aria-label={t("roles.unassign")}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <Badge variant="secondary">{t(`roles.${member.role}` as "roles.admin")}</Badge>
                {member.is_proxy && (
                  <Badge variant="outline" className="text-xs">{t("members.proxy")}</Badge>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:gap-4">
                {(() => {
                  const proxyPhone = (member.privacy_settings as Record<string, string> | null)?.proxy_phone;
                  const privSettings = (member.privacy_settings || {}) as Record<string, boolean>;
                  const regularPhone = privSettings.show_phone && profile?.phone;
                  const phoneToShow = member.is_proxy ? proxyPhone : regularPhone;
                  return phoneToShow ? (
                    <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{String(phoneToShow)}</span>
                  ) : null;
                })()}
                {joinedAt && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {ts("memberSince", { date: formatDateWithGroupFormat(joinedAt, groupDateFormat, locale) })}
                    {yearsOfMembership > 0 && (
                      <span className="text-xs">({ts("yearsOfMembership", { count: yearsOfMembership })})</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════ SECTION 2: STANDING STATUS ═══════════════════════ */}
      {standingData && (
        <Card className="overflow-hidden">
          <div className={`border-b px-6 py-4 ${style.banner}`}>
            <div className="flex items-center gap-3">
              {standing === "good" ? (
                <CheckCircle2 className={`h-6 w-6 ${style.bannerText}`} />
              ) : standing === "warning" ? (
                <AlertTriangle className={`h-6 w-6 ${style.bannerText}`} />
              ) : (
                <XCircle className={`h-6 w-6 ${style.bannerText}`} />
              )}
              <span className={`text-lg font-bold ${style.bannerText}`}>
                {standing === "good"
                  ? ts("goodStanding")
                  : standing === "warning"
                  ? ts("atRisk")
                  : ts("notInGoodStanding")}
              </span>
              <Tooltip>
                <TooltipTrigger className={`cursor-help ${style.bannerText} opacity-70`}>
                  <HelpCircle className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">{th("memberStanding")}</p>
                </TooltipContent>
              </Tooltip>
              <span className={`ml-auto text-sm font-medium ${style.bannerText}`}>
                {standingData.score}%
              </span>
            </div>
          </div>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">{ts("standingBreakdown")}</p>
            <div className="space-y-2">
              {standingData.reasons.map((reason, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {reason.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className={reason.passed ? "text-muted-foreground" : "text-foreground font-medium"}>
                    {locale === "fr" ? reason.detail_fr : reason.detail_en}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════ SECTION 3: YEAR-OVER-YEAR MINI MATRIX ═══════════════════════ */}
      {oblsByTypeAndYear.size > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-primary" />
              {ts("paymentMiniMatrix")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("contributions.type")}</th>
                    {years.map((y) => (
                      <th key={y} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(oblsByTypeAndYear.entries()).map(([typeName, yearMap]) => (
                    <tr key={typeName} className="border-b last:border-0">
                      <td className="px-4 py-2 text-xs font-medium">{typeName}</td>
                      {years.map((y) => {
                        const obl = yearMap.get(y);
                        if (!obl) return <td key={y} className="px-3 py-2 text-center text-muted-foreground">—</td>;
                        return (
                          <td key={y} className="px-3 py-2 text-center">
                            {obl.status === "paid" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : obl.status === "partial" ? (
                              <AlertTriangle className="h-4 w-4 text-yellow-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════ SECTION 4: FINANCIAL SUMMARY ═══════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            {ts("financialSummary")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{ts("totalPaid")}</p>
              <p className="text-lg font-bold text-primary">{formatAmount(totalPaidAllTime, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("totalOutstanding")}</p>
              <p className={`text-lg font-bold ${totalOutstandingAmount > 0 ? "text-destructive" : ""}`}>
                {formatAmount(totalOutstandingAmount, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("lastPaymentDate")}</p>
              <p className="text-sm font-medium">
                {lastPayment ? formatDateWithGroupFormat(lastPayment.recorded_at as string, groupDateFormat, locale) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("lastPaymentAmount")}</p>
              <p className="text-sm font-medium">
                {lastPayment ? formatAmount(Number(lastPayment.amount), (lastPayment.currency as string) || currency) : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════ SECTION 5: ATTENDANCE SUMMARY ═══════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {ts("attendanceSummary")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{ts("attendanceRate")}</span>
              <span className="text-sm font-bold">{attendanceRate}%</span>
            </div>
            <Progress value={attendanceRate} className="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">{ts("totalEvents")}</p>
              <p className="text-lg font-bold">{totalAttendances}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("presentCount")}</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{presentCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("absentCount")}</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{absentCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("excusedCount")}</p>
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{excusedCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ts("currentStreak")}</p>
              <p className="text-lg font-bold">{currentStreak}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════ SECTION 6: HOSTING COMPLIANCE ═══════════════════════ */}
      {hostingAssignments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              {ts("hostingSummary")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">{ts("timesHosted")}</p>
                <p className="text-lg font-bold">{timesHosted}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{ts("timesMissed")}</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{timesMissed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{ts("complianceScore")}</p>
                <p className="text-lg font-bold">{complianceScore}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{ts("nextHosting")}</p>
                <p className="text-sm font-medium">
                  {nextHosting ? formatDateWithGroupFormat(nextHosting.assigned_date as string, groupDateFormat, locale) : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════ SECTION 7: RELIEF PLAN STATUS ═══════════════════════ */}
      {reliefEnrollments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              {ts("reliefPlanStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {reliefEnrollments.map((enrollment: Record<string, unknown>) => {
                const plan = enrollment.relief_plan as Record<string, unknown> | null;
                const planName = locale === "fr" && plan?.name_fr ? (plan.name_fr as string) : (plan?.name as string) || "—";
                const contribStatus = enrollment.contribution_status as string;
                const isBehind = contribStatus === "behind" || contribStatus === "overdue";
                const isSuspended = contribStatus === "suspended";
                const statusLabel = contribStatus === "up_to_date" ? t("relief.upToDate")
                  : contribStatus === "behind" ? t("relief.behind")
                  : contribStatus === "suspended" ? t("relief.suspended")
                  : contribStatus || "—";
                return (
                  <div key={enrollment.id as string} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{planName}</p>
                      <p className="text-xs text-muted-foreground">{(enrollment.is_active as boolean) ? t("common.active") : t("common.inactive")}</p>
                    </div>
                    <Badge variant={isBehind || isSuspended ? "destructive" : "secondary"} className="text-xs">
                      {statusLabel}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════ SECTION 8: QUICK ACTIONS ═══════════════════════ */}
      <PermissionGate anyOf={["finances.record", "members.manage"]}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{ts("quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <PermissionGate permission="finances.record">
                <Link href={`/dashboard/contributions/record?member=${membershipId}`}>
                  <Button variant="outline" size="sm">
                    <CreditCard className="mr-2 h-3.5 w-3.5" />
                    {ts("recordPayment")}
                  </Button>
                </Link>
              </PermissionGate>
              <PermissionGate permission="members.manage">
                <Button variant="outline" size="sm" onClick={() => openEditDialog()}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {ts("editMember")}
                </Button>
              </PermissionGate>
              <PermissionGate permission="members.manage">
                <Button variant="outline" size="sm" onClick={() => { setNewStanding(member.standing as string || "good"); setOverrideReason(""); setShowStandingDialog(true); }}>
                  <Shield className="mr-2 h-3.5 w-3.5" />
                  {ts("changeStandingOverride")}
                </Button>
              </PermissionGate>
              <Link href={`/dashboard/membership-card?memberId=${membershipId}`}>
                <Button variant="outline" size="sm">
                  <CreditCard className="mr-2 h-3.5 w-3.5" />
                  {t("membershipCard.viewCard")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </PermissionGate>

      {/* ═══════════════════════ SECTION 9: FAMILY & DEPENDENTS ═══════════════════════ */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Contact className="h-4 w-4 text-primary" />
            {t("members.familyDependents")}
          </CardTitle>
          {(hasPermission("members.manage") || isOwner) && (
            <Button variant="outline" size="sm" onClick={() => openFamilyDialog()}>
              {t("members.addFamilyMember")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {familyMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Contact className="h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">{t("members.noFamilyMembers")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {(familyMembers as Array<{ id: string; name: string; relationship: string; date_of_birth: string | null; notes: string | null }>).map((fm) => (
                <div key={fm.id} className="flex items-center gap-3 px-4 py-3">
                  <Heart className="h-4 w-4 text-pink-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fm.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{fm.relationship}</p>
                  </div>
                  {fm.date_of_birth && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateWithGroupFormat(fm.date_of_birth, groupDateFormat, locale)}
                    </span>
                  )}
                  {(hasPermission("members.manage") || isOwner) && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openFamilyDialog(fm)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={deletingFamilyId === fm.id}
                        onClick={() => handleDeleteFamily(fm)}
                      >
                        {deletingFamilyId === fm.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════ SECTION 10: ACTIVITY TIMELINE ═══════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            {ts("activityTimeline")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(() => {
            // Build unified timeline from payments + attendances
            const timeline: Array<{ type: string; date: Date; label: string; detail: string }> = [];

            for (const p of payments.slice(0, 10) as Array<Record<string, unknown>>) {
              const ct = p.contribution_type as Record<string, unknown> | null;
              timeline.push({
                type: "payment",
                date: new Date(p.recorded_at as string),
                label: (ct?.name as string) || t("members.contributionHistory"),
                detail: formatAmount(Number(p.amount), (p.currency as string) || currency),
              });
            }

            for (const a of attendances.slice(0, 10) as Array<Record<string, unknown>>) {
              const ev = a.event as Record<string, unknown> | null;
              timeline.push({
                type: "attendance",
                date: new Date(a.checked_in_at as string || (ev?.starts_at as string)),
                label: (ev?.title as string) || "",
                detail: (a.status as string) || "",
              });
            }

            timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
            const top10 = timeline.slice(0, 10);

            if (top10.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-8">
                  <Activity className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">{t("members.noHistory")}</p>
                </div>
              );
            }

            return (
              <div className="divide-y">
                {top10.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    {item.type === "payment" ? (
                      <CreditCard className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDateWithGroupFormat(item.date, groupDateFormat, locale)}</p>
                    </div>
                    <span className="text-xs font-medium shrink-0">
                      {item.type === "payment" ? (
                        <span className="text-primary">{item.detail}</span>
                      ) : (
                        <Badge variant={item.detail === "present" || item.detail === "late" ? "secondary" : "destructive"} className="text-[10px]">
                          {item.detail}
                        </Badge>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ═══════════════════════ DIALOGS ═══════════════════════ */}

      {/* Edit Member Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditError(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("members.editMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("members.displayName")} <span className="text-red-500">*</span></Label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} placeholder={t("members.displayName")} />
            </div>
            <div className="space-y-2">
              <Label>{t("members.memberTitle")}</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t("members.titlePlaceholder")} />
              <p className="text-[11px] text-muted-foreground">{t("members.titleHint")}</p>
            </div>
            {!member?.is_proxy && (
              <div className="space-y-2">
                <Label>{t("members.email")}</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder={t("members.email")} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("members.phone")}</Label>
              <PhoneInput
                value={editPhone}
                onChange={setEditPhone}
                defaultCountryCode={getDefaultCountryCode(currentGroup?.currency)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("members.role")}</Label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="owner">{t("roles.owner")}</option>
                <option value="admin">{t("roles.admin")}</option>
                <option value="moderator">{t("roles.moderator")}</option>
                <option value="member">{t("roles.member")}</option>
              </select>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleEditMember} disabled={actionSaving || !editDisplayName.trim()}>
              {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standing Override Dialog */}
      <Dialog open={showStandingDialog} onOpenChange={setShowStandingDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ts("changeStandingOverride")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={newStanding} onValueChange={(v) => setNewStanding(v || "")}>
              <SelectTrigger>
                <SelectValue placeholder={t("members.selectStanding")} />
              </SelectTrigger>
              <SelectContent>
                {["good", "warning", "suspended", "banned"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`members.standing${s.charAt(0).toUpperCase() + s.slice(1)}` as "members.standingGood")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-2">
              <Label>{ts("overrideReason")}</Label>
              <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder={ts("overrideReason")} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStandingDialog(false)}>{t("common.cancel")}</Button>
            <Button disabled={actionSaving} onClick={handleStandingOverride}>
              {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("members.editRole")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={newRole} onValueChange={(v) => setNewRole(v || "")}>
              <SelectTrigger>
                <SelectValue placeholder={t("members.selectRole")} />
              </SelectTrigger>
              <SelectContent>
                {(isOwner ? ["owner", "admin", "moderator", "member"] : ["admin", "moderator", "member"]).map((role) => (
                  <SelectItem key={role} value={role}>{t(`roles.${role}` as "roles.admin")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={actionSaving}
              onClick={async () => {
                // Block non-owners from assigning "owner" role
                if (newRole === "owner" && !isOwner) return;
                // Prevent demoting the owner — must transfer ownership first
                if ((member?.role as string) === "owner" && newRole !== "owner") {
                  showError(t("members.cannotDemoteOwner"));
                  return;
                }
                setActionSaving(true);
                try {
                  const { error } = await supabase.from("memberships").update({ role: newRole }).eq("id", membershipId);
                  if (error) throw error;
                  // Audit log
                  try {
                    const { logActivity } = await import("@/lib/audit-log");
                    await logActivity(supabase, {
                      groupId: groupId!,
                      action: "member.role_changed",
                      entityType: "membership",
                      entityId: membershipId,
                      description: `${memberName} role changed to ${newRole}`,
                      metadata: { newRole },
                    });
                  } catch { /* best-effort */ }
                  await queryClient.invalidateQueries({ queryKey: ["member-detail", membershipId] });
                  setShowRoleDialog(false);
                } catch (err) {
                  showError((err as Error).message || t("common.error"));
                } finally {
                  setActionSaving(false);
                }
              }}
            >
              {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Position Dialog */}
      <Dialog open={showPositionDialog} onOpenChange={setShowPositionDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("members.assignPosition")}</DialogTitle>
          </DialogHeader>
          <PositionSelector
            groupId={groupId}
            selectedPositionId={selectedPositionId}
            onSelect={setSelectedPositionId}
            t={t}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPositionDialog(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={actionSaving || !selectedPositionId}
              onClick={async () => {
                setActionSaving(true);
                try {
                  const { error } = await supabase.from("position_assignments").insert({
                    position_id: selectedPositionId,
                    membership_id: membershipId,
                    assigned_by: user?.id,
                  });
                  if (error) throw error;
                  await queryClient.invalidateQueries({ queryKey: ["member-positions", membershipId] });
                  setShowPositionDialog(false);
                  setSelectedPositionId("");
                } catch (err) {
                  showError((err as Error).message || t("common.error"));
                } finally {
                  setActionSaving(false);
                }
              }}
            >
              {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unassign Position Confirmation Dialog */}
      <Dialog open={!!unassignTarget} onOpenChange={(open) => { if (!open) setUnassignTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("roles.unassign")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("roles.unassignConfirm", { name: memberName, position: unassignTarget?.positionTitle || "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleUnassignPosition} disabled={unassigningSaving}>
              {unassigningSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("roles.unassign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Family Member Dialog */}
      <Dialog open={familyDialogOpen} onOpenChange={(open) => { setFamilyDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFamily ? t("members.editFamilyMember") : t("members.addFamilyMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("members.familyName")} <span className="text-red-500">*</span></Label>
              <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder={t("members.familyName")} />
            </div>
            <div className="space-y-2">
              <Label>{t("members.familyRelationship")}</Label>
              <Select value={familyRelationship} onValueChange={(v) => setFamilyRelationship(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spouse">{t("members.familyRelSpouse")}</SelectItem>
                  <SelectItem value="child">{t("members.familyRelChild")}</SelectItem>
                  <SelectItem value="parent">{t("members.familyRelParent")}</SelectItem>
                  <SelectItem value="sibling">{t("members.familyRelSibling")}</SelectItem>
                  <SelectItem value="other">{t("members.familyRelOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("members.familyDateOfBirth")}</Label>
              <Input type="date" value={familyDob} onChange={(e) => setFamilyDob(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("members.familyNotes")}</Label>
              <Textarea value={familyNotes} onChange={(e) => setFamilyNotes(e.target.value)} placeholder={t("members.familyNotes")} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamilyDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={familySaving || !familyName.trim()} onClick={handleSaveFamily}>
              {familySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("members.removeMember")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("members.confirmRemoveMember", { name: memberName })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              disabled={actionSaving}
              onClick={async () => {
                setActionSaving(true);
                try {
                  const { error } = await supabase.from("memberships").delete().eq("id", membershipId);
                  if (error) throw error;
                  // Audit log
                  try {
                    const { logActivity } = await import("@/lib/audit-log");
                    await logActivity(supabase, {
                      groupId: groupId!,
                      action: "member.removed",
                      entityType: "membership",
                      entityId: membershipId,
                      description: `${memberName} was removed from the group`,
                    });
                  } catch { /* best-effort */ }
                  await queryClient.invalidateQueries({ queryKey: ["members"] });
                  router.push("/dashboard/members");
                } catch (err) {
                  showError((err as Error).message || t("common.error"));
                } finally {
                  setActionSaving(false);
                }
              }}
            >
              {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("members.removeMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PositionSelector({ groupId, selectedPositionId, onSelect, t }: {
  groupId: string | null;
  selectedPositionId: string;
  onSelect: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { data: positions, isLoading } = useQuery({
    queryKey: ["group-positions", groupId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("group_positions")
        .select("id, title, title_fr")
        .eq("group_id", groupId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!positions || positions.length === 0) return <p className="text-sm text-muted-foreground">{t("members.noPositionsAvailable")}</p>;

  return (
    <Select value={selectedPositionId} onValueChange={(v) => onSelect(v || "")}>
      <SelectTrigger>
        <SelectValue placeholder={t("members.selectPosition")} />
      </SelectTrigger>
      <SelectContent>
        {positions.map((pos) => (
          <SelectItem key={pos.id} value={pos.id}>{pos.title}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
