"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput, getDefaultCountryCode } from "@/components/ui/phone-input";
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
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  Crown,
  Calendar,
  Loader2,
  Phone,
  MoreVertical,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  UserMinus,
  FileUp,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import Papa from "papaparse";
import { useMembers, useGroupPositions } from "@/lib/hooks/use-supabase-query";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type Standing = "good" | "warning" | "suspended" | "banned";

const standingConfig: Record<Standing, { color: string; dotColor: string }> = {
  good: { color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dotColor: "bg-emerald-500" },
  warning: { color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", dotColor: "bg-yellow-500" },
  suspended: { color: "bg-red-500/10 text-red-700 dark:text-red-400", dotColor: "bg-red-500" },
  banned: { color: "bg-red-900/10 text-red-900 dark:text-red-300", dotColor: "bg-red-900" },
};

const roleConfig: Record<string, { icon: typeof Shield; color: string }> = {
  owner: { icon: Crown, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  admin: { icon: ShieldCheck, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  moderator: { icon: Shield, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20" },
  member: { icon: Users, color: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20" },
};

interface CsvRow {
  display_name: string;
  title: string;
  email: string;
  phone: string;
  role: string;
  status: "valid" | "error" | "warning";
  statusMsg: string;
}

const VALID_ROLES = ["member", "admin", "moderator"];

const ITEMS_PER_PAGE = 25;
const VIEW_PREFERENCE_KEY = "villageclaq-members-view";

export default function MembersPage() {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const tt = useTranslations("transfers");
  const router = useRouter();
  const { isAdmin, groupId, user, currentGroup, currentMembership } = useGroup();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: members, isLoading, isError, error, refetch } = useMembers();
  const { data: positions } = useGroupPositions();
  const { hasPermission } = usePermissions();
  const canManageMembers = hasPermission("manage_members");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [standingFilter, setStandingFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "grid">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(VIEW_PREFERENCE_KEY) as "table" | "grid") || "table";
    }
    return "table";
  });

  // Add member dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin" | "moderator">("member");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Transfer member state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferMember, setTransferMember] = useState<Record<string, unknown> | null>(null);
  const [transferToId, setTransferToId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferPreserve, setTransferPreserve] = useState(true);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [subGroupsList, setSubGroupsList] = useState<Array<{ id: string; name: string }>>([]);

  // Bulk import state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<1 | 2 | 3>(1);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResults, setImportResults] = useState<{ succeeded: number; failed: { name: string; error: string }[] }>({ succeeded: 0, failed: [] });
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit member dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStanding, setEditStanding] = useState("");
  const [editIsProxy, setEditIsProxy] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Auto-open proxy member dialog when navigated with ?addProxy=true
  useEffect(() => {
    if (searchParams.get("addProxy") === "true" && isAdmin) {
      setAddDialogOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams, isAdmin]);

  function handleViewChange(mode: "table" | "grid") {
    setViewMode(mode);
    localStorage.setItem(VIEW_PREFERENCE_KEY, mode);
  }

  function resetAddForm() {
    setNewFullName("");
    setNewTitle("");
    setNewEmail("");
    setNewPhone("");
    setNewRole("member");
    setAddError(null);
  }

  async function openTransferMember(member: Record<string, unknown>) {
    setTransferMember(member);
    setTransferToId("");
    setTransferReason("");
    setTransferPreserve(true);
    setTransferError(null);
    // Fetch sub-groups for this group
    if (groupId) {
      const supabase = createClient();
      const { data } = await supabase.from("committees").select("id, name").eq("group_id", groupId).eq("is_active", true);
      setSubGroupsList((data || []) as Array<{ id: string; name: string }>);
    }
    setTransferDialogOpen(true);
  }

  async function handleTransfer() {
    if (!transferMember || !transferToId || !groupId) return;
    setTransferSaving(true);
    setTransferError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("sub_group_transfers").insert({
        group_id: groupId,
        membership_id: transferMember.id as string,
        to_subgroup_id: transferToId,
        reason: transferReason.trim() || null,
        preserve_standing: transferPreserve,
        requested_by: currentMembership?.id,
      });
      if (err) throw new Error(err.message);
      setTransferDialogOpen(false);
    } catch (err) {
      setTransferError((err as Error).message);
    } finally {
      setTransferSaving(false);
    }
  }

  function openEditMember(member: Record<string, unknown>) {
    const profile = member.profile as { full_name?: string; phone?: string; id?: string } | undefined;
    const privacySettings = member.privacy_settings as Record<string, unknown> | null;
    const isProxy = member.is_proxy as boolean;

    // For display name: proxy members have display_name on membership; real members use profile.full_name
    const name = (member.display_name as string) || profile?.full_name || "";
    // Extract title if display_name contains a title prefix (e.g., "Chief John Doe")
    // We store title in privacy_settings.proxy_name for proxy members, but there's no separate title field
    // So we just use the full display name
    setEditDisplayName(name);
    setEditTitle("");
    setEditEmail("");
    setEditPhone(isProxy ? ((privacySettings?.proxy_phone as string) || "") : (profile?.phone || ""));
    setEditRole((member.role as string) || "member");
    setEditStanding((member.standing as string) || "good");
    setEditIsProxy(isProxy);
    setEditUserId(isProxy ? null : (profile?.id as string || null));
    setEditMemberId(member.id as string);
    setEditError(null);
    setEditDialogOpen(true);
  }

  async function handleEditMember() {
    if (!editMemberId || !editDisplayName.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const supabase = createClient();

      // Update membership fields (role, standing, display_name)
      const membershipUpdate: Record<string, unknown> = {
        role: editRole,
        standing: editStanding,
        display_name: editDisplayName.trim(),
      };

      if (editIsProxy) {
        // For proxy members, update phone in privacy_settings
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
        .eq("id", editMemberId);
      if (membershipErr) throw new Error(membershipErr.message);

      // For real (non-proxy) members, also update profile
      if (!editIsProxy && editUserId) {
        const profileUpdate: Record<string, unknown> = {
          full_name: editDisplayName.trim(),
        };
        if (editPhone !== undefined) profileUpdate.phone = editPhone || null;
        const { error: profileErr } = await supabase
          .from("profiles")
          .update(profileUpdate)
          .eq("id", editUserId);
        if (profileErr) throw new Error(profileErr.message);
      }

      await queryClient.invalidateQueries({ queryKey: ["members", groupId] });
      setEditDialogOpen(false);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  }

  function resetBulkImport() {
    setBulkStep(1);
    setCsvRows([]);
    setImportProgress(0);
    setImportTotal(0);
    setImportResults({ succeeded: 0, failed: [] });
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function downloadTemplate() {
    const csv = `display_name,title,email,phone,role\n"John Doe","","john@email.com","+13014335857","member"\n"Mama Grace","Chief","","","member"`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "villageclaq-member-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleCsvFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: CsvRow[] = (results.data as Record<string, string>[]).map((raw) => {
          const displayName = (raw.display_name || raw.name || "").trim();
          const title = (raw.title || "").trim();
          const email = (raw.email || "").trim();
          const phone = (raw.phone || "").trim();
          const role = (raw.role || "member").trim().toLowerCase();

          let status: CsvRow["status"] = "valid";
          let statusMsg = "";

          if (!displayName) {
            status = "error";
            statusMsg = t("nameRequired");
          } else if (role && !VALID_ROLES.includes(role)) {
            status = "warning";
            statusMsg = t("invalidRole");
          }

          return { display_name: displayName, title, email, phone, role: role || "member", status, statusMsg };
        });
        setCsvRows(rows);
        setBulkStep(2);
      },
    });
  }

  function updateCsvRow(index: number, field: keyof CsvRow, value: string) {
    setCsvRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      // Re-validate
      if (!row.display_name.trim()) {
        row.status = "error";
        row.statusMsg = t("nameRequired");
      } else if (row.role && !VALID_ROLES.includes(row.role.toLowerCase())) {
        row.status = "warning";
        row.statusMsg = t("invalidRole");
      } else {
        row.status = "valid";
        row.statusMsg = "";
      }
      next[index] = row;
      return next;
    });
  }

  const bulkCounts = useMemo(() => {
    const valid = csvRows.filter((r) => r.status === "valid").length;
    const errors = csvRows.filter((r) => r.status === "error").length;
    const warnings = csvRows.filter((r) => r.status === "warning").length;
    return { valid, errors, warnings };
  }, [csvRows]);

  async function handleBulkImport() {
    if (!groupId) return;
    const validRows = csvRows.filter((r) => r.status !== "error");
    setImportTotal(validRows.length);
    setImportProgress(0);
    setIsImporting(true);
    setBulkStep(3);

    const failed: { name: string; error: string }[] = [];
    let succeeded = 0;
    const supabase = createClient();

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const displayName = row.title
        ? `${row.title} ${row.display_name}`
        : row.display_name;
      const role = VALID_ROLES.includes(row.role) ? row.role : "member";

      try {
        const { error: rpcError } = await supabase.rpc("create_proxy_member", {
          p_group_id: groupId,
          p_display_name: displayName,
          p_phone: row.phone || null,
          p_role: role,
        });
        if (rpcError) throw new Error(rpcError.message);
        succeeded++;
      } catch (err) {
        failed.push({ name: row.display_name, error: (err as Error).message });
      }
      setImportProgress(i + 1);
      // Small delay to avoid overwhelming Supabase
      if (i < validRows.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    setImportResults({ succeeded, failed });
    setIsImporting(false);
    await queryClient.invalidateQueries({ queryKey: ["members", groupId] });
  }

  async function handleAddMember() {
    if (!newFullName.trim() || !groupId || !user) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const supabase = createClient();
      const displayName = newTitle.trim()
        ? `${newTitle.trim()} ${newFullName.trim()}`
        : newFullName.trim();
      const { data, error: rpcError } = await supabase.rpc("create_proxy_member", {
        p_group_id: groupId,
        p_display_name: displayName,
        p_phone: newPhone || null,
        p_role: newRole,
      });

      if (rpcError) throw new Error(rpcError.message);

      await queryClient.invalidateQueries({ queryKey: ["members", groupId] });
      setAddDialogOpen(false);
      resetAddForm();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAddSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (!members) return [];
    let result = members;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((m: Record<string, unknown>) => {
        const profile = m.profile as { full_name?: string; phone?: string } | undefined;
        const displayName = (m.display_name as string) || "";
        const fullName = profile?.full_name || "";
        const phone = profile?.phone || "";
        const privacySettings = m.privacy_settings as Record<string, unknown> | null;
        const proxyPhone = (privacySettings?.proxy_phone as string) || "";
        return (
          fullName.toLowerCase().includes(q) ||
          displayName.toLowerCase().includes(q) ||
          phone.includes(q) ||
          proxyPhone.includes(q)
        );
      });
    }

    // Role filter
    if (roleFilter !== "all") {
      result = result.filter((m: Record<string, unknown>) => m.role === roleFilter);
    }

    // Standing filter
    if (standingFilter !== "all") {
      result = result.filter((m: Record<string, unknown>) => m.standing === standingFilter);
    }

    // Position filter
    if (positionFilter !== "all" && positions) {
      const pos = positions.find((p: Record<string, unknown>) => p.id === positionFilter);
      if (pos) {
        const assignments = (pos.position_assignments as Array<{ membership: { id: string } }>) || [];
        const assignedIds = new Set(assignments.map((a) => a.membership?.id).filter(Boolean));
        result = result.filter((m: Record<string, unknown>) => assignedIds.has(m.id as string));
      }
    }

    return result;
  }, [members, search, roleFilter, standingFilter, positionFilter, positions]);

  // Build membership → position titles map
  const memberPositionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!positions) return map;
    for (const pos of positions as Array<Record<string, unknown>>) {
      const title = pos.title as string;
      const assignments = (pos.position_assignments as Array<{ membership: { id: string } }>) || [];
      for (const a of assignments) {
        if (!a.membership?.id) continue;
        const existing = map.get(a.membership.id) || [];
        existing.push(title);
        map.set(a.membership.id, existing);
      }
    }
    return map;
  }, [positions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, standingFilter, positionFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const showingTo = Math.min(page * ITEMS_PER_PAGE, filtered.length);

  if (isLoading) {
    return <ListSkeleton rows={6} />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  const getName = (member: Record<string, unknown>) => {
    const profile = member.profile as { full_name?: string } | undefined;
    return (member.display_name as string) || profile?.full_name || t("unnamed");
  };

  const getPhone = (member: Record<string, unknown>) => {
    const profile = member.profile as { phone?: string } | undefined;
    const privacySettings = member.privacy_settings as Record<string, unknown> | null;
    if (member.is_proxy && privacySettings?.proxy_phone) {
      return privacySettings.proxy_phone as string;
    }
    return profile?.phone || null;
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => handleViewChange("table")}
              aria-label={t("tableView")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => handleViewChange("grid")}
              aria-label={t("gridView")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          {canManageMembers && (
            <>
              <Button variant="outline" onClick={() => { resetBulkImport(); setBulkDialogOpen(true); }}>
                <FileUp className="mr-2 h-4 w-4" />
                {t("bulkImport")}
              </Button>
              <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t("addMember")}
              </Button>
              <Link href="/dashboard/invitations">
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("inviteMember")}
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchMembers")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "all")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAll")}</SelectItem>
                <SelectItem value="owner">{t("filterOwner")}</SelectItem>
                <SelectItem value="admin">{t("filterAdmin")}</SelectItem>
                <SelectItem value="moderator">{t("filterModerator")}</SelectItem>
                <SelectItem value="member">{t("filterMember")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={standingFilter} onValueChange={(v) => setStandingFilter(v ?? "all")}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder={t("standing")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAll")}</SelectItem>
                <SelectItem value="good">{t("standingGood")}</SelectItem>
                <SelectItem value="warning">{t("standingWarning")}</SelectItem>
                <SelectItem value="suspended">{t("standingSuspended")}</SelectItem>
                <SelectItem value="banned">{t("standingBanned")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={positionFilter} onValueChange={(v) => setPositionFilter(v ?? "all")}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={tr("position")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("allPositions")}</SelectItem>
                {(positions || []).map((pos: Record<string, unknown>) => (
                  <SelectItem key={pos.id as string} value={pos.id as string}>
                    {pos.title as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("totalCount", { count: filtered.length })}
        </p>
      </div>

      {/* Members */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("noMembers")}
          description={t("searchMembers")}
        />
      ) : viewMode === "table" ? (
        /* Table View */
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnName")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("standing")}</TableHead>
                <TableHead className="hidden lg:table-cell">{tr("position")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("phone")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("joinedDate")}</TableHead>
                <TableHead>{t("columnStatus")}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((member: Record<string, unknown>) => {
                const id = member.id as string;
                const role = (member.role as string) || "member";
                const standing = (member.standing as Standing) || "good";
                const joinedAt = member.joined_at as string;
                const profile = member.profile as {
                  id?: string;
                  full_name?: string;
                  avatar_url?: string;
                  phone?: string;
                } | undefined;
                const name = getName(member);
                const phone = getPhone(member);
                const isProxy = member.is_proxy as boolean;
                const standingStyle = standingConfig[standing] || standingConfig.good;
                const roleStyle = roleConfig[role] || roleConfig.member;
                const isActive = standing === "good" || standing === "warning";

                return (
                  <TableRow
                    key={id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/members/${id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{name}</span>
                          {isProxy && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                              {t("proxyMember")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs capitalize ${roleStyle.color}`}>
                        {role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${standingStyle.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${standingStyle.dotColor}`} />
                        {t(
                          `standing${standing.charAt(0).toUpperCase() + standing.slice(1)}` as
                            | "standingGood"
                            | "standingWarning"
                            | "standingSuspended"
                            | "standingBanned"
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const titles = memberPositionMap.get(id);
                        if (!titles || titles.length === 0) return "—";
                        return (
                          <div className="flex flex-wrap gap-1">
                            {titles.map((title, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                                {title}
                              </Badge>
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {phone ? String(phone) : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {joinedAt ? formatDate(joinedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                        <span className="text-xs text-muted-foreground">
                          {isActive ? t("statusActive") : t("statusInactive")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManageMembers && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); openEditMember(member); }}
                            >
                              <Edit className="h-4 w-4" /> {t("editMember")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${id}`); }}
                            >
                              <Eye className="h-4 w-4" /> {t("viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${id}`); }}
                            >
                              <Shield className="h-4 w-4" /> {t("changeStanding")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${id}`); }}
                            >
                              <Shield className="h-4 w-4" /> {t("assignPosition")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); openTransferMember(member); }}
                            >
                              <ArrowRightLeft className="h-4 w-4" /> {tt("transferMember")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="flex items-center gap-2 text-destructive"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${id}`); }}
                            >
                              <UserMinus className="h-4 w-4" /> {t("removeMember")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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
          {paginated.map((member: Record<string, unknown>) => {
            const id = member.id as string;
            const role = (member.role as string) || "member";
            const standing = (member.standing as Standing) || "good";
            const joinedAt = member.joined_at as string;
            const profile = member.profile as {
              id?: string;
              full_name?: string;
              avatar_url?: string;
              phone?: string;
            } | undefined;
            const name = getName(member);
            const phone = getPhone(member);
            const isProxy = member.is_proxy as boolean;
            const standingStyle = standingConfig[standing] || standingConfig.good;
            const roleStyle = roleConfig[role] || roleConfig.member;
            const RoleIcon = roleStyle.icon;

            return (
              <Card
                key={id}
                className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => router.push(`/dashboard/members/${id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {getInitials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${standingStyle.dotColor}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
                          {name}
                        </p>
                        <RoleIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 capitalize ${roleStyle.color}`}
                        >
                          {role}
                        </Badge>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${standingStyle.color}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${standingStyle.dotColor}`}
                          />
                          {t(
                            `standing${standing.charAt(0).toUpperCase() + standing.slice(1)}` as
                              | "standingGood"
                              | "standingWarning"
                              | "standingSuspended"
                              | "standingBanned"
                          )}
                        </span>
                      </div>
                      {phone ? (
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{String(phone)}</span>
                        </div>
                      ) : null}
                      {joinedAt && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(joinedAt)}</span>
                        </div>
                      )}
                      {isProxy && (
                        <Badge variant="outline" className="mt-1.5 text-[10px] px-1.5 py-0 text-muted-foreground">
                          {t("proxyMember")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("showingRange", { from: showingFrom, to: showingTo, total: filtered.length })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("next")}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetAddForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("displayName")} <span className="text-red-500">*</span></Label>
              <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder={t("displayName")} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>{t("memberTitle")}</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
              <p className="text-[11px] text-muted-foreground">{t("titleHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("email")}</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t("email")} />
            </div>
            <div className="space-y-2">
              <Label>{t("phone")}</Label>
              <PhoneInput
                value={newPhone}
                onChange={setNewPhone}
                defaultCountryCode={getDefaultCountryCode(currentGroup?.currency)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("role")}</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "member" | "admin" | "moderator")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">{t("proxyHint")}</p>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleAddMember} disabled={addSaving || !newFullName.trim()}>
              {addSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Member Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(o) => { setTransferDialogOpen(o); if (!o) setTransferError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tt("transferMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{tt("memberName")}</Label>
              <Input value={transferMember ? getName(transferMember) : ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>{tt("to")}</Label>
              <select
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{tt("selectSubGroup")}</option>
                {subGroupsList.map((sg) => (
                  <option key={sg.id} value={sg.id}>{sg.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{tt("reason")}</Label>
              <Input value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder={tt("reason")} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={transferPreserve} onChange={(e) => setTransferPreserve(e.target.checked)} className="rounded" />
              <div>
                <Label>{tt("preserveStanding")}</Label>
                <p className="text-xs text-muted-foreground">{tt("preserveStandingHelp")}</p>
              </div>
            </div>
            {transferError && <p className="text-sm text-destructive">{transferError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleTransfer} disabled={transferSaving || !transferToId}>
              {transferSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tt("transferMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("displayName")} <span className="text-red-500">*</span></Label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} placeholder={t("displayName")} />
            </div>
            <div className="space-y-2">
              <Label>{t("memberTitle")}</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
              <p className="text-[11px] text-muted-foreground">{t("titleHint")}</p>
            </div>
            {!editIsProxy && (
              <div className="space-y-2">
                <Label>{t("email")}</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder={t("email")} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("phone")}</Label>
              <PhoneInput
                value={editPhone}
                onChange={setEditPhone}
                defaultCountryCode={getDefaultCountryCode(currentGroup?.currency)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("role")}</Label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="member">Member</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("standing")}</Label>
              <select
                value={editStanding}
                onChange={(e) => setEditStanding(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="good">{t("standingGood")}</option>
                <option value="warning">{t("standingWarning")}</option>
                <option value="suspended">{t("standingSuspended")}</option>
                <option value="banned">{t("standingBanned")}</option>
              </select>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t("previous") === "Previous" ? "Cancel" : "Annuler"}
            </Button>
            <Button onClick={handleEditMember} disabled={editSaving || !editDisplayName.trim()}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("previous") === "Previous" ? "Save" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) resetBulkImport(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              {t("bulkImport")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("step", { current: bulkStep, total: 3 })}
            </p>
          </DialogHeader>

          {/* Step 1: Upload CSV */}
          {bulkStep === 1 && (
            <div className="space-y-4">
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file && file.name.endsWith(".csv")) handleCsvFile(file);
                }}
              >
                <Upload className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium">{t("uploadCsv")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("dragOrClick")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvFile(file);
                  }}
                />
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                {t("downloadTemplate")}
              </Button>
            </div>
          )}

          {/* Step 2: Preview & Validate */}
          {bulkStep === 2 && (
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t("validRows", { count: bulkCounts.valid })}
                </Badge>
                {bulkCounts.errors > 0 && (
                  <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">
                    <XCircle className="mr-1 h-3 w-3" />
                    {t("errorRows", { count: bulkCounts.errors })}
                  </Badge>
                )}
                {bulkCounts.warnings > 0 && (
                  <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {t("warningRows", { count: bulkCounts.warnings })}
                  </Badge>
                )}
              </div>
              <div className="flex-1 overflow-auto rounded-md border min-h-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]">#</TableHead>
                      <TableHead>{t("displayName")}</TableHead>
                      <TableHead>{t("memberTitle")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("email")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("phone")}</TableHead>
                      <TableHead>{t("role")}</TableHead>
                      <TableHead>{t("columnStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.map((row, i) => (
                      <TableRow
                        key={i}
                        className={
                          row.status === "error"
                            ? "bg-red-500/5"
                            : row.status === "warning"
                            ? "bg-yellow-500/5"
                            : ""
                        }
                      >
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <Input
                            value={row.display_name}
                            onChange={(e) => updateCsvRow(i, "display_name", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.title}
                            onChange={(e) => updateCsvRow(i, "title", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Input
                            value={row.email}
                            onChange={(e) => updateCsvRow(i, "email", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Input
                            value={row.phone}
                            onChange={(e) => updateCsvRow(i, "phone", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            value={row.role}
                            onChange={(e) => updateCsvRow(i, "role", e.target.value)}
                            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                          >
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                            <option value="moderator">moderator</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          {row.status === "error" ? (
                            <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                              <XCircle className="h-3 w-3" />
                              {row.statusMsg}
                            </span>
                          ) : row.status === "warning" ? (
                            <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                              <AlertTriangle className="h-3 w-3" />
                              {row.statusMsg}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setBulkStep(1); setCsvRows([]); }}>
                  {t("previous")}
                </Button>
                <Button onClick={handleBulkImport} disabled={bulkCounts.valid === 0}>
                  {t("importAllValid")} ({bulkCounts.valid})
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Import Progress */}
          {bulkStep === 3 && (
            <div className="space-y-4">
              {isImporting ? (
                <>
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-medium">{t("importing")}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div
                      className="bg-primary h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {importProgress} / {importTotal}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    <span className="text-lg font-semibold">{t("importComplete")}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                      {t("imported", { count: importResults.succeeded })}
                    </p>
                    {importResults.failed.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {t("failed", { count: importResults.failed.length })}
                        </p>
                        <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                          {importResults.failed.map((f, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {t("rowFailed", { name: f.name, error: f.error })}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button onClick={() => { setBulkDialogOpen(false); resetBulkImport(); }}>
                      {t("next") === "Next" ? "Done" : "Terminé"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
