"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  ShieldCheck,
  Plus,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Users,
  Loader2,
  Search,
  Check,
  X,
  UserPlus,
  Calendar,
  HandCoins,
  BarChart3,
  Heart,
  Megaphone,
  Settings,
} from "lucide-react";
import { useGroupPositions, useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { RequirePermission } from "@/components/ui/permission-gate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";

// ─── Permission Modules Definition ───────────────────────────────────────────

interface PermissionDef {
  key: string;
  labelKey: string;
  descKey: string;
}

interface PermissionCategory {
  labelKey: string;
  icon: typeof Shield;
  permissions: PermissionDef[];
}

// Each UI toggle key maps 1:1 to a DB permission key (dot-notation).
// These are stored directly in position_permissions.permission column.
const PERMISSION_MODULES: PermissionCategory[] = [
  {
    labelKey: "categoryMemberManagement",
    icon: Users,
    permissions: [
      { key: "members.manage", labelKey: "permManageMembers", descKey: "permManageMembersDesc" },
      { key: "members.invite", labelKey: "permInviteMembers", descKey: "permInviteMembersDesc" },
    ],
  },
  {
    labelKey: "categoryEventManagement",
    icon: Calendar,
    permissions: [
      { key: "events.manage", labelKey: "permManageEvents", descKey: "permManageEventsDesc" },
      { key: "attendance.manage", labelKey: "permManageAttendance", descKey: "permManageAttendanceDesc" },
    ],
  },
  {
    labelKey: "categoryFinancialManagement",
    icon: HandCoins,
    permissions: [
      { key: "finances.record", labelKey: "permRecordPayments", descKey: "permRecordPaymentsDesc" },
      { key: "finances.manage", labelKey: "permManageFinances", descKey: "permManageFinancesDesc" },
      { key: "finances.view", labelKey: "permViewFinances", descKey: "permViewFinancesDesc" },
      { key: "contributions.manage", labelKey: "permManageContributions", descKey: "permManageContributionsDesc" },
    ],
  },
  {
    labelKey: "categoryReportsData",
    icon: BarChart3,
    permissions: [
      { key: "reports.view", labelKey: "permViewReports", descKey: "permViewReportsDesc" },
      { key: "reports.export", labelKey: "permExportData", descKey: "permExportDataDesc" },
    ],
  },
  {
    labelKey: "categoryReliefPlans",
    icon: Heart,
    permissions: [
      { key: "relief.manage", labelKey: "permManageRelief", descKey: "permManageReliefDesc" },
    ],
  },
  {
    labelKey: "categoryCommunications",
    icon: Megaphone,
    permissions: [
      { key: "notifications.send", labelKey: "permSendNotifications", descKey: "permSendNotificationsDesc" },
      { key: "announcements.manage", labelKey: "permManageAnnouncements", descKey: "permManageAnnouncementsDesc" },
    ],
  },
  {
    labelKey: "categoryAdministration",
    icon: Settings,
    permissions: [
      { key: "roles.manage", labelKey: "permManageRoles", descKey: "permManageRolesDesc" },
      { key: "settings.manage", labelKey: "permManageSettings", descKey: "permManageSettingsDesc" },
      { key: "disputes.manage", labelKey: "permManageDisputes", descKey: "permManageDisputesDesc" },
      { key: "documents.manage", labelKey: "permManageDocuments", descKey: "permManageDocumentsDesc" },
      { key: "elections.manage", labelKey: "permManageElections", descKey: "permManageElectionsDesc" },
      { key: "savings.manage", labelKey: "permManageSavings", descKey: "permManageSavingsDesc" },
      { key: "hosting.manage", labelKey: "permManageHosting", descKey: "permManageHostingDesc" },
      { key: "minutes.manage", labelKey: "permManageMinutes", descKey: "permManageMinutesDesc" },
    ],
  },
];

// 1:1 mapping — UI key IS the DB key. No lossy collapsing.
function dbPermsToUiKeys(dbPerms: string[]): Set<string> {
  return new Set(dbPerms);
}

function uiKeysToDbPerms(uiKeys: Set<string>): string[] {
  return [...uiKeys];
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), { year: "numeric", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

export default function RolesPage() {
  const locale = useLocale();
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const { groupId } = useGroup();
  const queryClient = useQueryClient();
  const { data: positions, isLoading, isError, error, refetch } = useGroupPositions();
  const { data: members } = useMembers();

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editPosition, setEditPosition] = useState<Record<string, unknown> | null>(null);
  const [permissionsPosition, setPermissionsPosition] = useState<Record<string, unknown> | null>(null);
  const [assignPosition, setAssignPosition] = useState<Record<string, unknown> | null>(null);
  const [deletePosition, setDeletePosition] = useState<Record<string, unknown> | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formTitleFr, setFormTitleFr] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");
  const [formIsExecutive, setFormIsExecutive] = useState(false);
  const [formMaxHolders, setFormMaxHolders] = useState("1");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Permissions state
  const [enabledPerms, setEnabledPerms] = useState<Set<string>>(new Set());
  const [permsSaving, setPermsSaving] = useState(false);

  // Assign members state
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSaving, setAssignSaving] = useState<string | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  function resetForm() {
    setFormTitle("");
    setFormTitleFr("");
    setFormDescription("");
    setFormSortOrder("0");
    setFormIsExecutive(false);
    setFormMaxHolders("1");
    setFormError(null);
  }

  function openEdit(pos: Record<string, unknown>) {
    setFormTitle((pos.title as string) || "");
    setFormTitleFr((pos.title_fr as string) || "");
    setFormDescription((pos.description as string) || "");
    setFormSortOrder(String(pos.sort_order ?? 0));
    setFormIsExecutive(!!pos.is_executive);
    setFormMaxHolders(String(pos.max_holders ?? 1));
    setFormError(null);
    setEditPosition(pos);
  }

  function openPermissions(pos: Record<string, unknown>) {
    const perms = (pos.position_permissions as Array<{ permission: string }>) || [];
    const dbPerms = perms.map((p) => p.permission);
    setEnabledPerms(dbPermsToUiKeys(dbPerms));
    setPermissionsPosition(pos);
  }

  async function handleCreate() {
    if (!formTitle.trim() || !groupId) return;
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("group_positions").insert({
        group_id: groupId,
        title: formTitle.trim(),
        title_fr: formTitleFr.trim() || null,
        description: formDescription.trim() || null,
        sort_order: Number(formSortOrder) || 0,
        is_executive: formIsExecutive,
        max_holders: Number(formMaxHolders) || 1,
      });
      if (err) throw new Error(err.message);
      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
      setShowCreateDialog(false);
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!formTitle.trim() || !editPosition) return;
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("group_positions")
        .update({
          title: formTitle.trim(),
          title_fr: formTitleFr.trim() || null,
          description: formDescription.trim() || null,
          sort_order: Number(formSortOrder) || 0,
          is_executive: formIsExecutive,
          max_holders: Number(formMaxHolders) || 1,
        })
        .eq("id", editPosition.id as string);
      if (err) throw new Error(err.message);
      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
      setEditPosition(null);
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletePosition) return;
    const assignments = (deletePosition.position_assignments as unknown[]) || [];
    if (assignments.length > 0) {
      setFormError(t("cannotDeleteAssigned"));
      return;
    }
    setDeleting(true);
    try {
      const supabase = createClient();
      // Delete permissions first, then position
      await supabase.from("position_permissions").delete().eq("position_id", deletePosition.id as string);
      const { error: err } = await supabase.from("group_positions").delete().eq("id", deletePosition.id as string);
      if (err) throw new Error(err.message);
      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
      setDeletePosition(null);
      setFormError(null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSavePermissions() {
    if (!permissionsPosition) return;
    setPermsSaving(true);
    try {
      const supabase = createClient();
      const posId = permissionsPosition.id as string;

      // Delete all existing permissions for this position
      await supabase.from("position_permissions").delete().eq("position_id", posId);

      // Insert new permissions
      const dbPerms = uiKeysToDbPerms(enabledPerms);
      if (dbPerms.length > 0) {
        const rows = dbPerms.map((perm) => ({ position_id: posId, permission: perm }));
        const { error: err } = await supabase.from("position_permissions").insert(rows);
        if (err) throw new Error(err.message);
      }

      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
      setPermissionsPosition(null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setPermsSaving(false);
    }
  }

  function togglePerm(key: string) {
    setEnabledPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Assign members helpers
  const assignedMemberIds = useMemo(() => {
    if (!assignPosition) return new Set<string>();
    const assignments = (assignPosition.position_assignments as Array<{ membership: { id: string } }>) || [];
    return new Set(assignments.map((a) => a.membership?.id).filter(Boolean));
  }, [assignPosition]);

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    if (!assignSearch.trim()) return members;
    const q = assignSearch.toLowerCase();
    return members.filter((m: Record<string, unknown>) => {
      const profile = m.profile as { full_name?: string } | undefined;
      const displayName = (m.display_name as string) || "";
      const fullName = profile?.full_name || "";
      return fullName.toLowerCase().includes(q) || displayName.toLowerCase().includes(q);
    });
  }, [members, assignSearch]);

  async function handleToggleAssignment(membershipId: string, isAssigned: boolean) {
    if (!assignPosition) return;
    setAssignSaving(membershipId);
    try {
      const supabase = createClient();
      const posId = assignPosition.id as string;

      if (isAssigned) {
        // Unassign: set ended_at instead of deleting to keep history
        await supabase
          .from("position_assignments")
          .update({ ended_at: new Date().toISOString() })
          .eq("position_id", posId)
          .eq("membership_id", membershipId)
          .is("ended_at", null);
      } else {
        // Assign
        await supabase.from("position_assignments").insert({
          position_id: posId,
          membership_id: membershipId,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
      // Refresh local state by re-fetching
      const { data: refreshed } = await createClient()
        .from("group_positions")
        .select("*, position_assignments(*, membership:memberships!inner(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url))), position_permissions(*)")
        .eq("id", posId)
        .single();
      if (refreshed) setAssignPosition(refreshed);
    } catch {
      // silently fail
    } finally {
      setAssignSaving(null);
    }
  }

  if (isLoading) return <RequirePermission permission="roles.manage"><ListSkeleton rows={6} /></RequirePermission>;
  if (isError) return <RequirePermission permission="roles.manage"><ErrorState message={(error as Error)?.message} onRetry={() => refetch()} /></RequirePermission>;

  const positionsList = positions || [];

  return (
    <RequirePermission permission="roles.manage">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
          <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addRole")}
          </Button>
        </div>

        {/* Roles Table */}
        {positionsList.length === 0 ? (
          <EmptyState icon={Shield} title={t("noRoles")} description={t("description")} />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("roleName")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("roleDescription")}</TableHead>
                  <TableHead>{t("assigned")}</TableHead>
                  <TableHead>{t("permissions")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("created")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="w-[50px]">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positionsList.map((pos: Record<string, unknown>) => {
                  const id = pos.id as string;
                  const title = (pos.title as string) || "";
                  const description = (pos.description as string) || "";
                  const assignments = (pos.position_assignments as unknown[]) || [];
                  const perms = (pos.position_permissions as unknown[]) || [];
                  const isExec = pos.is_executive as boolean;
                  const createdAt = pos.created_at as string;

                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{title}</span>
                          {isExec && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                              {t("executive")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[200px]">
                        <span className="text-sm text-muted-foreground truncate block">{description || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {assignments.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t("permissionsCount", { count: perms.length })}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {createdAt ? formatDate(createdAt) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" variant="outline">
                          {t("active")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="flex items-center gap-2" onClick={() => openPermissions(pos)}>
                              <Eye className="h-4 w-4" /> {t("viewPermissions")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2" onClick={() => openEdit(pos)}>
                              <Edit className="h-4 w-4" /> {t("editRole")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2" onClick={() => { setAssignSearch(""); setAssignPosition(pos); }}>
                              <UserPlus className="h-4 w-4" /> {t("assignMembers")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="flex items-center gap-2 text-destructive" onClick={() => { setFormError(null); setDeletePosition(pos); }}>
                              <Trash2 className="h-4 w-4" /> {t("deleteRole")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create Role Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetForm(); }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createRole")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("roleName")} <span className="text-red-500">*</span></Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t("roleName")} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>{t("roleNameFr")}</Label>
                <Input value={formTitleFr} onChange={(e) => setFormTitleFr(e.target.value)} placeholder={t("roleNameFr")} />
              </div>
              <div className="space-y-2">
                <Label>{t("roleDescription")}</Label>
                <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("sortOrder")}</Label>
                  <Input type="number" min="0" max="100" value={formSortOrder} onChange={(e) => setFormSortOrder(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("maxHolders")}</Label>
                  <Input type="number" min="1" value={formMaxHolders} onChange={(e) => setFormMaxHolders(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={formIsExecutive} onCheckedChange={setFormIsExecutive} />
                <div>
                  <Label>{t("isExecutive")}</Label>
                  <p className="text-xs text-muted-foreground">{t("executiveHelp")}</p>
                </div>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving || !formTitle.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("createRole")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        <Dialog open={!!editPosition} onOpenChange={(open) => { if (!open) { setEditPosition(null); resetForm(); } }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("editRole")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("roleName")} <span className="text-red-500">*</span></Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t("roleName")} />
              </div>
              <div className="space-y-2">
                <Label>{t("roleNameFr")}</Label>
                <Input value={formTitleFr} onChange={(e) => setFormTitleFr(e.target.value)} placeholder={t("roleNameFr")} />
              </div>
              <div className="space-y-2">
                <Label>{t("roleDescription")}</Label>
                <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("sortOrder")}</Label>
                  <Input type="number" min="0" max="100" value={formSortOrder} onChange={(e) => setFormSortOrder(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("maxHolders")}</Label>
                  <Input type="number" min="1" value={formMaxHolders} onChange={(e) => setFormMaxHolders(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={formIsExecutive} onCheckedChange={setFormIsExecutive} />
                <div>
                  <Label>{t("isExecutive")}</Label>
                  <p className="text-xs text-muted-foreground">{t("executiveHelp")}</p>
                </div>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleUpdate} disabled={saving || !formTitle.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("updateRole")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Permissions Matrix Dialog */}
        <Dialog open={!!permissionsPosition} onOpenChange={(open) => { if (!open) setPermissionsPosition(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {t("permissions")} — {(permissionsPosition?.title as string) || ""}
              </DialogTitle>
              <div className="mt-1">
                <Badge variant="secondary">{t("permissionsCount", { count: enabledPerms.size })}</Badge>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {PERMISSION_MODULES.map((category) => {
                const CategoryIcon = category.icon;
                return (
                  <div key={category.labelKey}>
                    <div className="flex items-center gap-2 mb-3">
                      <CategoryIcon className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">{t(category.labelKey)}</h3>
                    </div>
                    <div className="space-y-2">
                      {category.permissions.map((perm) => (
                        <div
                          key={perm.key}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex-1 min-w-0 mr-3">
                            <p className="text-sm font-medium">{t(perm.labelKey)}</p>
                            <p className="text-xs text-muted-foreground">{t(perm.descKey)}</p>
                          </div>
                          <Switch
                            checked={enabledPerms.has(perm.key)}
                            onCheckedChange={() => togglePerm(perm.key)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="border-t pt-4">
              <Button onClick={handleSavePermissions} disabled={permsSaving}>
                {permsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("updatePermissions")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Members Dialog */}
        <Dialog open={!!assignPosition} onOpenChange={(open) => { if (!open) setAssignPosition(null); }}>
          <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("assignMembers")} — {(assignPosition?.title as string) || ""}
              </DialogTitle>
            </DialogHeader>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchMembers")}
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredMembers.map((member: Record<string, unknown>) => {
                const mId = member.id as string;
                const profile = member.profile as { full_name?: string; avatar_url?: string } | undefined;
                const displayName = getMemberName(member);
                const isAssigned = assignedMemberIds.has(mId);
                const isSaving = assignSaving === mId;

                return (
                  <div
                    key={mId}
                    className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/50 cursor-pointer"
                    onClick={() => !isSaving && handleToggleAssignment(mId, isAssigned)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(displayName || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{displayName}</span>
                    </div>
                    <div className="flex items-center">
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : isAssigned ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30">
                          <Plus className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletePosition} onOpenChange={(open) => { if (!open) { setDeletePosition(null); setFormError(null); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("deleteRole")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("confirmDelete")}</p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeletePosition(null); setFormError(null); }}>
                {tc("cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("deleteRole")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  );
}
