"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import {
  Shield,
  ShieldCheck,
  Headphones,
  TrendingUp,
  Wallet,
  Plus,
  MoreHorizontal,
  UserCog,
  UserMinus,
  Ban,
  Clock,
  Activity,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { useAdminMutate } from "@/lib/hooks/use-admin-mutate";

type StaffRole = "super_admin" | "admin" | "support" | "sales" | "finance";

interface StaffMember {
  id: string;
  user_id: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface ActivityLog {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  platform_staff: {
    profiles: {
      full_name: string | null;
    } | null;
  } | null;
}

const roleColors: Record<StaffRole, string> = {
  super_admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  support: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  sales: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  finance: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const roleIcons: Record<StaffRole, typeof Shield> = {
  super_admin: ShieldCheck,
  admin: Shield,
  support: Headphones,
  sales: TrendingUp,
  finance: Wallet,
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function StaffPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  // Existing state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Feedback state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showError, setShowError] = useState<string | null>(null);

  // Change Role dialog state
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [roleStaffId, setRoleStaffId] = useState<string | null>(null);
  const [roleStaffName, setRoleStaffName] = useState("");
  const [changeRoleValue, setChangeRoleValue] = useState<string>("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  // Suspend/Activate dialog state
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendStaffId, setSuspendStaffId] = useState<string | null>(null);
  const [suspendStaffName, setSuspendStaffName] = useState("");
  const [suspendAction, setSuspendAction] = useState<"suspend" | "activate">("suspend");
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);

  // Remove dialog state
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [removeStaffId, setRemoveStaffId] = useState<string | null>(null);
  const [removeStaffName, setRemoveStaffName] = useState("");
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  // Current user ID for self-action prevention
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const showSuccessBanner = useCallback((msg: string) => {
    setShowSuccess(true);
    setSuccessMessage(msg);
    setTimeout(() => setShowSuccess(false), 3000);
  }, []);

  const { mutate } = useAdminMutate();

  const { results, loading, refetch } = useAdminQuery([
    {
      key: "staff",
      table: "platform_staff",
      select: "id, user_id, role, is_active, created_at, profiles(id, full_name, avatar_url)",
      filters: [{ column: "is_active", op: "eq", value: true }],
    },
    {
      key: "logs",
      table: "platform_audit_logs",
      select: "id, action, target_type, target_id, details, created_at, platform_staff(profiles(full_name))",
      order: { column: "created_at", ascending: false },
      limit: 20,
    },
  ]);

  const staff = (results.staff?.data ?? []) as unknown as StaffMember[];
  const activityLogs = (results.logs?.data ?? []) as unknown as ActivityLog[];

  // Fetch current user ID once
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then((res) => {
      if (res.data?.user) setCurrentUserId(res.data.user.id);
    });
  }, []);

  // --- Add Staff Handler ---
  const handleAddStaff = async () => {
    if (!newEmail || !newRole) return;
    setSubmitting(true);
    setShowError(null);

    // First look up the user profile via the admin query API
    const lookupRes = await fetch("/api/admin/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: [{
          key: "profile",
          table: "profiles",
          select: "id",
          filters: [{ column: "full_name", op: "ilike", value: `%${newEmail}%` }],
          limit: 1,
        }],
      }),
    });
    const lookupBody = await lookupRes.json();
    const profile = (lookupBody.results?.profile?.data ?? [])[0] as { id: string } | undefined;

    if (!profile) {
      setShowError(t("noUsers"));
      setSubmitting(false);
      return;
    }

    const { error } = await mutate({
      action: "added_staff",
      table: "platform_staff",
      type: "insert",
      data: { user_id: profile.id, role: newRole, is_active: true },
    });

    if (error) {
      setShowError(error);
    } else {
      setAddDialogOpen(false);
      setNewEmail("");
      setNewRole("");
      showSuccessBanner(t("addStaff"));
      refetch();
    }

    setSubmitting(false);
  };

  // --- Change Role Handler ---
  const handleChangeRole = async () => {
    if (!roleStaffId || !changeRoleValue) return;
    setRoleSubmitting(true);
    setShowError(null);

    const { error } = await mutate({
      action: "changed_role",
      table: "platform_staff",
      type: "update",
      data: { role: changeRoleValue },
      match: { id: roleStaffId },
    });

    if (error) {
      setShowError(error);
    } else {
      setShowRoleDialog(false);
      setRoleStaffId(null);
      setChangeRoleValue("");
      showSuccessBanner(t("roleChanged"));
      refetch();
    }

    setRoleSubmitting(false);
  };

  // --- Suspend/Activate Handler ---
  const handleSuspendActivate = async () => {
    if (!suspendStaffId) return;
    setSuspendSubmitting(true);
    setShowError(null);

    const newActive = suspendAction === "activate";

    const { error } = await mutate({
      action: suspendAction === "suspend" ? "suspended_staff" : "activated_staff",
      table: "platform_staff",
      type: "update",
      data: { is_active: newActive },
      match: { id: suspendStaffId },
    });

    if (error) {
      setShowError(error);
    } else {
      setShowSuspendDialog(false);
      setSuspendStaffId(null);
      showSuccessBanner(suspendAction === "suspend" ? t("staffSuspended") : t("staffActivated"));
      refetch();
    }

    setSuspendSubmitting(false);
  };

  // --- Remove Handler ---
  const handleRemove = async () => {
    if (!removeStaffId) return;
    setRemoveSubmitting(true);
    setShowError(null);

    const { error } = await mutate({
      action: "removed_staff",
      table: "platform_staff",
      type: "delete",
      match: { id: removeStaffId },
    });

    if (error) {
      setShowError(error);
    } else {
      setShowRemoveDialog(false);
      setRemoveStaffId(null);
      showSuccessBanner(t("staffRemoved"));
      refetch();
    }

    setRemoveSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("staff")}</h1>
          <p className="text-sm text-muted-foreground">{t("staffSubtitle")}</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger
            render={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("addStaff")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("addStaff")}</DialogTitle>
              <DialogDescription>{t("addStaffDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t("staffEmail")}</Label>
                <Input
                  type="email"
                  placeholder="staff@villageclaq.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("staffRole")}</Label>
                <Select value={newRole} onValueChange={(val) => setNewRole(val ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                    <SelectItem value="support">{t("roles.support")}</SelectItem>
                    <SelectItem value="sales">{t("roles.sales")}</SelectItem>
                    <SelectItem value="finance">{t("roles.finance")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleAddStaff}
                disabled={submitting || !newEmail || !newRole}
                className="gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("invite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Success Banner */}
      {showSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Error Banner */}
      {showError && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {showError}
          </div>
          <button onClick={() => setShowError(null)} className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Staff list */}
      <div className="grid gap-4">
        {staff.map((member) => {
          const RoleIcon = roleIcons[member.role] || Shield;
          const name = member.profiles?.full_name || "Unknown";
          const staffUserId = member.user_id || "";
          const avatar = getInitials(member.profiles?.full_name);
          const joinedDate = new Date(member.created_at).toLocaleDateString(dateLocale);

          return (
            <Card key={member.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {staffUserId}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <Badge
                    className={`gap-1.5 ${roleColors[member.role] || ""}`}
                  >
                    <RoleIcon className="h-3 w-3" />
                    {t(`roles.${member.role}`)}
                  </Badge>

                  <div className="hidden text-right text-xs text-muted-foreground md:block">
                    <p>
                      {t("staffJoined")}: {joinedDate}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => {
                          setRoleStaffId(member.id);
                          setRoleStaffName(name);
                          setChangeRoleValue(member.role);
                          setShowRoleDialog(true);
                        }}
                      >
                        <UserCog className="h-4 w-4" />
                        {t("changeRole")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => {
                          if (member.user_id === currentUserId) {
                            setShowError(t("cannotSuspendSelf"));
                            return;
                          }
                          setSuspendStaffId(member.id);
                          setSuspendStaffName(name);
                          setSuspendAction(member.is_active ? "suspend" : "activate");
                          setShowSuspendDialog(true);
                        }}
                      >
                        <Ban className="h-4 w-4" />
                        {member.is_active ? t("suspendStaff") : t("activateStaff")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-red-600 dark:text-red-400"
                        onClick={() => {
                          if (member.user_id === currentUserId) {
                            setShowError(t("cannotRemoveSelf"));
                            return;
                          }
                          setRemoveStaffId(member.id);
                          setRemoveStaffName(name);
                          setShowRemoveDialog(true);
                        }}
                      >
                        <UserMinus className="h-4 w-4" />
                        {t("removeStaff")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {staff.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("noStaff")}
          </p>
        )}
      </div>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            {t("staffActivity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activityLogs.map((log) => {
              const staffName =
                log.platform_staff?.profiles?.full_name || "Unknown";
              const timestamp = new Date(log.created_at).toLocaleString(dateLocale);

              return (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{staffName}</span>
                        {" — "}
                        {log.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.target_type}
                        {log.target_id ? `: ${log.target_id}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="pl-7 text-xs text-muted-foreground sm:pl-0">
                    {timestamp}
                  </p>
                </div>
              );
            })}
            {activityLogs.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("noActivityLogs")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("changeRole")}</DialogTitle>
            <DialogDescription>
              {t("changeRoleFor", { name: roleStaffName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("newRole")}</Label>
              <Select value={changeRoleValue} onValueChange={(val) => setChangeRoleValue(val ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                  <SelectItem value="support">{t("roles.support")}</SelectItem>
                  <SelectItem value="sales">{t("roles.sales")}</SelectItem>
                  <SelectItem value="finance">{t("roles.finance")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleChangeRole}
              disabled={roleSubmitting || !changeRoleValue}
              className="gap-2"
            >
              {roleSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Activate Confirmation Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmAction")}</DialogTitle>
            <DialogDescription>
              {suspendAction === "suspend" ? t("confirmSuspend") : t("confirmActivate")}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{suspendStaffName}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant={suspendAction === "suspend" ? "destructive" : "default"}
              onClick={handleSuspendActivate}
              disabled={suspendSubmitting}
              className="gap-2"
            >
              {suspendSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {suspendAction === "suspend" ? t("suspendStaff") : t("activateStaff")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmAction")}</DialogTitle>
            <DialogDescription>{t("confirmRemove")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">{removeStaffName}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeSubmitting}
              className="gap-2"
            >
              {removeSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("removeStaff")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
