"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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

type StaffRole = "super_admin" | "admin" | "support" | "sales" | "finance";

interface StaffMember {
  id: string;
  user_id: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [staffResult, logsResult] = await Promise.all([
      supabase
        .from("platform_staff")
        .select("id, user_id, role, is_active, created_at, profiles(full_name, email, avatar_url)")
        .eq("is_active", true),
      supabase
        .from("platform_audit_logs")
        .select("id, action, target_type, target_id, details, created_at, platform_staff(profiles(full_name))")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (staffResult.data) {
      setStaff(staffResult.data as unknown as StaffMember[]);
    }
    if (logsResult.data) {
      setActivityLogs(logsResult.data as unknown as ActivityLog[]);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddStaff = async () => {
    if (!newEmail || !newRole) return;
    setSubmitting(true);

    // Look up user by email in profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", newEmail)
      .single();

    if (!profile) {
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("platform_staff").insert({
      user_id: profile.id,
      role: newRole,
      is_active: true,
    });

    if (!error) {
      setAddDialogOpen(false);
      setNewEmail("");
      setNewRole("");
      fetchData();
    }

    setSubmitting(false);
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
          <h1 className="text-2xl font-bold tracking-tight">{t("staff")}</h1>
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

      {/* Staff list */}
      <div className="grid gap-4">
        {staff.map((member) => {
          const RoleIcon = roleIcons[member.role] || Shield;
          const name = member.profiles?.full_name || member.profiles?.email || "Unknown";
          const email = member.profiles?.email || "";
          const avatar = getInitials(member.profiles?.full_name);
          const joinedDate = new Date(member.created_at).toLocaleDateString();

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
                      {email}
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
                      <DropdownMenuItem className="gap-2">
                        <UserCog className="h-4 w-4" />
                        {t("changeRole")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <Ban className="h-4 w-4" />
                        {t("suspendStaff")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-red-600 dark:text-red-400">
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
              const timestamp = new Date(log.created_at).toLocaleString();

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
                {t("noActivity")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
