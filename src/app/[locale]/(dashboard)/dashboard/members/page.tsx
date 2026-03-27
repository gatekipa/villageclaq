"use client";

import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
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

const ITEMS_PER_PAGE = 25;
const VIEW_PREFERENCE_KEY = "villageclaq-members-view";

export default function MembersPage() {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const router = useRouter();
  const { isAdmin, groupId, user, currentGroup } = useGroup();
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
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${id}`); }}
                            >
                              <Eye className="h-4 w-4" /> {t("viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${id}`); }}
                            >
                              <Edit className="h-4 w-4" /> {t("editRole")}
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
    </div>
  );
}
