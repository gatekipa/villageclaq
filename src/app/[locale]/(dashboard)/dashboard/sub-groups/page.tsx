"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Users,
  Loader2,
  Search,
  Check,
  Layers,
  Calendar,
  Mail,
  List,
  LayoutGrid,
  GitBranch,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { RequirePermission } from "@/components/ui/permission-gate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName as getMemberNameShared } from "@/lib/get-member-name";

const supabase = createClient();

const TYPE_COLORS: Record<string, string> = {
  committee: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  chapter: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  department: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  project: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
};

const VIEW_KEY = "villageclaq-subgroups-view";

function useSubGroups(groupId: string | null) {
  return useQuery({
    queryKey: ["sub-groups", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("committees")
        .select("*, committee_members(id, membership_id)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

function useSubGroupTransfers(groupId: string | null) {
  return useQuery({
    queryKey: ["sub-group-transfers", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("sub_group_transfers")
        .select("*, membership:memberships!sub_group_transfers_membership_id_fkey(id, display_name, profiles!memberships_user_id_fkey(full_name))")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      if (error) return []; // Table may not exist yet
      return data || [];
    },
    enabled: !!groupId,
  });
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), { year: "numeric", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

export default function SubGroupsPage() {
  const locale = useLocale();
  const t = useTranslations("subgroups");
  const tt = useTranslations("transfers");
  const tc = useTranslations("common");
  const { groupId, currentMembership } = useGroup();
  const queryClient = useQueryClient();
  const { data: subGroups, isLoading, isError, error, refetch } = useSubGroups(groupId);
  const { data: members } = useMembers();
  const { data: pendingTransfers = [] } = useSubGroupTransfers(groupId);

  const [viewMode, setViewMode] = useState<"table" | "grid">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem(VIEW_KEY) as "table" | "grid") || "table";
    return "table";
  });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editSubGroup, setEditSubGroup] = useState<Record<string, unknown> | null>(null);
  const [deleteSubGroup, setDeleteSubGroup] = useState<Record<string, unknown> | null>(null);
  const [detailSubGroup, setDetailSubGroup] = useState<Record<string, unknown> | null>(null);
  const [assignSubGroup, setAssignSubGroup] = useState<Record<string, unknown> | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("committee");
  const [formDescription, setFormDescription] = useState("");
  const [formLeaderId, setFormLeaderId] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formSchedule, setFormSchedule] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Assign state
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSaving, setAssignSaving] = useState<string | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());

  // Transfer approval
  const [transferSaving, setTransferSaving] = useState<string | null>(null);

  function resetForm() {
    setFormName(""); setFormType("committee"); setFormDescription("");
    setFormLeaderId(""); setFormEmail(""); setFormSchedule("");
    setFormIsActive(true); setFormError(null);
  }

  function openEdit(sg: Record<string, unknown>) {
    setFormName((sg.name as string) || "");
    setFormType((sg.type as string) || "committee");
    setFormDescription((sg.description as string) || "");
    setFormLeaderId((sg.leader_id as string) || "");
    setFormEmail((sg.email as string) || "");
    setFormSchedule((sg.meeting_schedule as string) || "");
    setFormIsActive(sg.is_active !== false);
    setFormError(null);
    setEditSubGroup(sg);
  }

  function openAssign(sg: Record<string, unknown>) {
    const cm = (sg.committee_members as Array<{ membership_id: string }>) || [];
    setAssignedIds(new Set(cm.map((m) => m.membership_id)));
    setAssignSearch("");
    setAssignSubGroup(sg);
  }

  function handleViewChange(mode: "table" | "grid") {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  }

  async function handleCreate() {
    if (!formName.trim() || !groupId) return;
    setSaving(true); setFormError(null);
    try {
      const { error: err } = await supabase.from("committees").insert({
        group_id: groupId,
        name: formName.trim(),
        type: formType,
        description: formDescription.trim() || null,
        leader_id: formLeaderId || null,
        email: formEmail.trim() || null,
        meeting_schedule: formSchedule.trim() || null,
        is_active: formIsActive,
      });
      if (err) throw new Error(err.message);
      await queryClient.invalidateQueries({ queryKey: ["sub-groups", groupId] });
      setShowCreateDialog(false); resetForm();
    } catch (err) { setFormError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!formName.trim() || !editSubGroup) return;
    setSaving(true); setFormError(null);
    try {
      const { error: err } = await supabase.from("committees").update({
        name: formName.trim(),
        type: formType,
        description: formDescription.trim() || null,
        leader_id: formLeaderId || null,
        email: formEmail.trim() || null,
        meeting_schedule: formSchedule.trim() || null,
        is_active: formIsActive,
      }).eq("id", editSubGroup.id as string);
      if (err) throw new Error(err.message);
      await queryClient.invalidateQueries({ queryKey: ["sub-groups", groupId] });
      setEditSubGroup(null); resetForm();
    } catch (err) { setFormError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteSubGroup) return;
    setSaving(true);
    try {
      await supabase.from("committee_members").delete().eq("committee_id", deleteSubGroup.id as string);
      const { error: err } = await supabase.from("committees").delete().eq("id", deleteSubGroup.id as string);
      if (err) throw new Error(err.message);
      await queryClient.invalidateQueries({ queryKey: ["sub-groups", groupId] });
      setDeleteSubGroup(null);
    } catch (err) { setFormError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleToggleAssign(membershipId: string, isAssigned: boolean) {
    if (!assignSubGroup) return;
    setAssignSaving(membershipId);
    try {
      const sgId = assignSubGroup.id as string;
      if (isAssigned) {
        await supabase.from("committee_members").delete().eq("committee_id", sgId).eq("membership_id", membershipId);
        setAssignedIds((prev) => { const n = new Set(prev); n.delete(membershipId); return n; });
      } else {
        await supabase.from("committee_members").insert({ committee_id: sgId, membership_id: membershipId });
        setAssignedIds((prev) => new Set(prev).add(membershipId));
      }
      await queryClient.invalidateQueries({ queryKey: ["sub-groups", groupId] });
    } catch (err) { setFormError((err as Error).message || tc("error")); }
    finally { setAssignSaving(null); }
  }

  async function handleTransferAction(transferId: string, action: "approved" | "rejected") {
    setTransferSaving(transferId);
    try {
      await supabase.from("sub_group_transfers").update({
        status: action,
        approved_at: new Date().toISOString(),
        approved_by: currentMembership?.id,
      }).eq("id", transferId);
      await queryClient.invalidateQueries({ queryKey: ["sub-group-transfers", groupId] });
    } catch (err) { setFormError((err as Error).message || tc("error")); }
    finally { setTransferSaving(null); }
  }

  const getMemberName = (id: string) => {
    if (!members) return "—";
    const m = members.find((mem: Record<string, unknown>) => mem.id === id) as Record<string, unknown> | undefined;
    if (!m) return "—";
    return getMemberNameShared(m);
  };

  const filtered = useMemo(() => {
    if (!subGroups) return [];
    return subGroups.filter((sg: Record<string, unknown>) => {
      const name = ((sg.name as string) || "").toLowerCase();
      const desc = ((sg.description as string) || "").toLowerCase();
      const leaderName = sg.leader_id ? getMemberName(sg.leader_id as string).toLowerCase() : "";
      const matchesSearch = !search || name.includes(search.toLowerCase()) || desc.includes(search.toLowerCase()) || leaderName.includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || sg.type === typeFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? sg.is_active !== false : sg.is_active === false);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [subGroups, search, typeFilter, statusFilter, members]);

  const filteredAssignMembers = useMemo(() => {
    if (!members) return [];
    if (!assignSearch.trim()) return members;
    const q = assignSearch.toLowerCase();
    return members.filter((m: Record<string, unknown>) => {
      return getMemberNameShared(m).toLowerCase().includes(q);
    });
  }, [members, assignSearch]);

  // Stats
  const stats = useMemo(() => {
    const list = subGroups || [];
    return {
      total: list.length,
      active: list.filter((s: Record<string, unknown>) => s.is_active !== false).length,
      committees: list.filter((s: Record<string, unknown>) => s.type === "committee").length,
      chapters: list.filter((s: Record<string, unknown>) => s.type === "chapter").length,
    };
  }, [subGroups]);

  if (isLoading) return <RequirePermission permission="members.manage"><ListSkeleton rows={6} /></RequirePermission>;
  if (isError) return <RequirePermission permission="members.manage"><ErrorState message={(error as Error)?.message} onRetry={() => refetch()} /></RequirePermission>;

  // Form dialog content (shared between create and edit)
  const formContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("name")} <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("name")} autoFocus />
      </div>
      <div className="space-y-2">
        <Label>{t("type")}</Label>
        <select value={formType} onChange={(e) => setFormType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="committee">{t("committee")}</option>
          <option value="chapter">{t("chapter")}</option>
          <option value="department">{t("department")}</option>
          <option value="project">{t("project")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>{t("descriptionField")}</Label>
        <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <Label>{t("leader")}</Label>
        <select value={formLeaderId} onChange={(e) => setFormLeaderId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">{t("selectLeader")}</option>
          {(members || []).map((m: Record<string, unknown>) => {
            const p = m.profile as { full_name?: string } | undefined;
            return <option key={m.id as string} value={m.id as string}>{getMemberNameShared(m)}</option>;
          })}
        </select>
      </div>
      <div className="space-y-2">
        <Label>{t("email")}</Label>
        <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder={t("email")} />
      </div>
      <div className="space-y-2">
        <Label>{t("meetingSchedule")}</Label>
        <Input value={formSchedule} onChange={(e) => setFormSchedule(e.target.value)} placeholder={t("meetingSchedulePlaceholder")} />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
        <Label>{t("active")}</Label>
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
    </div>
  );

  return (
    <RequirePermission permission="members.manage">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border">
              <Button variant={viewMode === "table" ? "default" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => handleViewChange("table")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => handleViewChange("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />{t("createSubGroup")}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t("total"), value: stats.total, icon: Layers },
            { label: t("activeCount"), value: stats.active, icon: CheckCircle2 },
            { label: t("committees"), value: stats.committees, icon: Users },
            { label: t("chapters"), value: stats.chapters, icon: GitBranch },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchSubGroups")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder={t("type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTypes")}</SelectItem>
              <SelectItem value="committee">{t("committee")}</SelectItem>
              <SelectItem value="chapter">{t("chapter")}</SelectItem>
              <SelectItem value="department">{t("department")}</SelectItem>
              <SelectItem value="project">{t("project")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder={t("allStatuses")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="active">{t("active")}</SelectItem>
              <SelectItem value="inactive">{t("inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sub-Groups */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={t("noSubGroups")}
            description={t("description")}
            action={
              <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                {t("create")}
              </Button>
            }
          />
        ) : viewMode === "table" ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("leader")}</TableHead>
                  <TableHead>{t("memberCount")}</TableHead>
                  <TableHead className="hidden md:table-cell">{tc("status")}</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sg: Record<string, unknown>) => {
                  const id = sg.id as string;
                  const name = (sg.name as string) || "";
                  const type = (sg.type as string) || "committee";
                  const desc = (sg.description as string) || "";
                  const leaderName = sg.leader_id ? getMemberName(sg.leader_id as string) : t("noLeader");
                  const memberCount = ((sg.committee_members as unknown[]) || []).length;
                  const isActive = sg.is_active !== false;

                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{name}</span>
                          {desc && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{desc}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs capitalize ${TYPE_COLORS[type] || ""}`}>
                          {t(type as "committee")}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm">{leaderName}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{memberCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className={isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}>
                          {isActive ? t("active") : t("inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="flex items-center gap-2" onClick={() => setDetailSubGroup(sg)}>
                              <Eye className="h-4 w-4" /> {t("viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2" onClick={() => openEdit(sg)}>
                              <Edit className="h-4 w-4" /> {t("editSubGroup")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2" onClick={() => openAssign(sg)}>
                              <Users className="h-4 w-4" /> {t("assignMembers")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="flex items-center gap-2 text-destructive" onClick={() => { setFormError(null); setDeleteSubGroup(sg); }}>
                              <Trash2 className="h-4 w-4" /> {t("deleteSubGroup")}
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
        ) : (
          /* Grid View */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((sg: Record<string, unknown>) => {
              const id = sg.id as string;
              const name = (sg.name as string) || "";
              const type = (sg.type as string) || "committee";
              const desc = (sg.description as string) || "";
              const leaderName = sg.leader_id ? getMemberName(sg.leader_id as string) : t("noLeader");
              const memberCount = ((sg.committee_members as unknown[]) || []).length;
              const isActive = sg.is_active !== false;
              const email = (sg.email as string) || "";
              const schedule = (sg.meeting_schedule as string) || "";

              return (
                <Card key={id} className="transition-all hover:shadow-md hover:border-primary/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{name}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className={`text-[10px] capitalize ${TYPE_COLORS[type] || ""}`}>{t(type as "committee")}</Badge>
                          <Badge variant="outline" className={`text-[10px] ${isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                            {isActive ? t("active") : t("inactive")}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(sg)}><Edit className="mr-2 h-4 w-4" />{t("editSubGroup")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAssign(sg)}><Users className="mr-2 h-4 w-4" />{t("assignMembers")}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => { setFormError(null); setDeleteSubGroup(sg); }}><Trash2 className="mr-2 h-4 w-4" />{t("deleteSubGroup")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {desc && <p className="text-xs text-muted-foreground line-clamp-2">{desc}</p>}
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Users className="h-3 w-3" />{t("leader")}: {leaderName}</div>
                      <div className="flex items-center gap-1.5"><Users className="h-3 w-3" />{memberCount} {t("memberCount").toLowerCase()}</div>
                      {email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /><a href={`mailto:${email}`} className="hover:underline">{email}</a></div>}
                      {schedule && <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{schedule}</div>}
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setDetailSubGroup(sg)}>
                      {t("viewDetails")}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pending Transfers */}
        {pendingTransfers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              {tt("pendingTransfers")}
            </h2>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tt("memberName")}</TableHead>
                    <TableHead>{tt("from")}</TableHead>
                    <TableHead>{tt("to")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tt("reason")}</TableHead>
                    <TableHead className="w-[150px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTransfers.map((tr: Record<string, unknown>) => {
                    const id = tr.id as string;
                    const membership = tr.membership as Record<string, unknown> | null;
                    const profile = membership?.profiles as Record<string, unknown> | null;
                    const memberName = getMemberNameShared(membership as Record<string, unknown>);
                    const fromName = subGroups?.find((s: Record<string, unknown>) => s.id === tr.from_subgroup_id)?.name || "—";
                    const toName = subGroups?.find((s: Record<string, unknown>) => s.id === tr.to_subgroup_id)?.name || "—";
                    const isSaving = transferSaving === id;

                    return (
                      <TableRow key={id}>
                        <TableCell className="font-medium">{memberName as string}</TableCell>
                        <TableCell>{fromName as string}</TableCell>
                        <TableCell>{toName as string}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{(tr.reason as string) || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isSaving} onClick={() => handleTransferAction(id, "approved")}>
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                              {tt("approve")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" disabled={isSaving} onClick={() => handleTransferAction(id, "rejected")}>
                              <XCircle className="mr-1 h-3 w-3" />{tt("reject")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(o) => { setShowCreateDialog(o); if (!o) resetForm(); }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("createSubGroup")}</DialogTitle></DialogHeader>
            {formContent}
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving || !formName.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("createSubGroup")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editSubGroup} onOpenChange={(o) => { if (!o) { setEditSubGroup(null); resetForm(); } }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("editSubGroup")}</DialogTitle></DialogHeader>
            {formContent}
            <DialogFooter>
              <Button onClick={handleUpdate} disabled={saving || !formName.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("editSubGroup")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={!!deleteSubGroup} onOpenChange={(o) => { if (!o) { setDeleteSubGroup(null); setFormError(null); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{t("deleteSubGroup")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("confirmDelete")}</p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteSubGroup(null)}>{tc("cancel")}</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("deleteSubGroup")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailSubGroup} onOpenChange={(o) => { if (!o) setDetailSubGroup(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{(detailSubGroup?.name as string) || ""}</DialogTitle></DialogHeader>
            {detailSubGroup && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Badge variant="outline" className={`capitalize ${TYPE_COLORS[(detailSubGroup.type as string) || "committee"] || ""}`}>
                    {t((detailSubGroup.type as string || "committee") as "committee")}
                  </Badge>
                  <Badge variant="outline" className={detailSubGroup.is_active !== false ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : ""}>
                    {detailSubGroup.is_active !== false ? t("active") : t("inactive")}
                  </Badge>
                </div>
                {detailSubGroup.description ? <p className="text-sm text-muted-foreground">{String(detailSubGroup.description)}</p> : null}
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">{t("leader")}:</span> {detailSubGroup.leader_id ? getMemberName(detailSubGroup.leader_id as string) : t("noLeader")}</div>
                  <div><span className="font-medium">{t("memberCount")}:</span> {((detailSubGroup.committee_members as unknown[]) || []).length}</div>
                  {detailSubGroup.email ? <div><span className="font-medium">{t("email")}:</span> <a href={`mailto:${String(detailSubGroup.email)}`} className="text-primary hover:underline">{String(detailSubGroup.email)}</a></div> : null}
                  {detailSubGroup.meeting_schedule ? <div><span className="font-medium">{t("meetingSchedule")}:</span> {String(detailSubGroup.meeting_schedule)}</div> : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setDetailSubGroup(null); openEdit(detailSubGroup); }}>
                    <Edit className="mr-1 h-3.5 w-3.5" />{t("editSubGroup")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setDetailSubGroup(null); openAssign(detailSubGroup); }}>
                    <Users className="mr-1 h-3.5 w-3.5" />{t("assignMembers")}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign Members Dialog */}
        <Dialog open={!!assignSubGroup} onOpenChange={(o) => { if (!o) setAssignSubGroup(null); }}>
          <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("assignMembers")} — {(assignSubGroup?.name as string) || ""}
              </DialogTitle>
            </DialogHeader>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("searchMembers")} value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredAssignMembers.map((member: Record<string, unknown>) => {
                const mId = member.id as string;
                const p = member.profile as { full_name?: string; avatar_url?: string } | undefined;
                const displayName = getMemberNameShared(member);
                const isAssigned = assignedIds.has(mId);
                const isSaving = assignSaving === mId;

                return (
                  <div key={mId} className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/50 cursor-pointer" onClick={() => !isSaving && handleToggleAssign(mId, isAssigned)}>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(displayName || "?")}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{displayName}</span>
                    </div>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : isAssigned ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30"><Plus className="h-3 w-3 text-muted-foreground" /></div>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  );
}
