"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Download,
  MoreHorizontal,
  Eye,
  Ban,
  UserCog,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 20;

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

interface MembershipCountRow {
  user_id: string;
  role: string;
  group_id: string;
}

interface AdminUser {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  groupCount: number;
  adminGroupCount: number;
}

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "noGroups">("all");
  const [sortField, setSortField] = useState<"name" | "groups" | "lastActive" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const supabase = createClient();

        const [profilesRes, membershipsRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, avatar_url, phone, created_at, updated_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("memberships")
            .select("user_id, role, group_id")
            .not("user_id", "is", null),
        ]);

        if (profilesRes.error || membershipsRes.error) {
          setError(true);
          setLoading(false);
          return;
        }

        const profiles = profilesRes.data as ProfileRow[];
        const memberships = membershipsRes.data as MembershipCountRow[];

        // Build count maps
        const groupCountMap: Record<string, Set<string>> = {};
        const adminCountMap: Record<string, number> = {};

        for (const m of memberships) {
          if (!groupCountMap[m.user_id]) {
            groupCountMap[m.user_id] = new Set();
          }
          groupCountMap[m.user_id].add(m.group_id);

          if (m.role === "admin" || m.role === "owner") {
            adminCountMap[m.user_id] = (adminCountMap[m.user_id] || 0) + 1;
          }
        }

        const mapped: AdminUser[] = profiles.map((p) => ({
          id: p.id,
          full_name: p.full_name ?? "",
          phone: p.phone ?? null,
          avatar_url: p.avatar_url ?? null,
          created_at: p.created_at,
          updated_at: p.updated_at,
          groupCount: groupCountMap[p.id]?.size ?? 0,
          adminGroupCount: adminCountMap[p.id] ?? 0,
        }));

        setUsers(mapped);
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    let result = users;

    // Status filter
    if (statusFilter === "active") result = result.filter((u) => u.groupCount > 0);
    else if (statusFilter === "noGroups") result = result.filter((u) => u.groupCount === 0);

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          (u.phone && u.phone.includes(q))
      );
    }

    // Sort
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === "name") cmp = a.full_name.localeCompare(b.full_name);
        else if (sortField === "groups") cmp = a.groupCount - b.groupCount;
        else if (sortField === "lastActive") cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        return sortDirection === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [users, search, statusFilter, sortField, sortDirection]);

  // Reset page when search or filter changes
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const total = users.length;
    const active = users.filter((u) => u.groupCount > 0).length;
    const noGroups = users.filter((u) => u.groupCount === 0).length;
    const newThisMonth = users.filter(
      (u) => new Date(u.created_at) >= monthStart
    ).length;
    return { total, active, noGroups, newThisMonth };
  }, [users]);

  function toggleSort(field: "name" | "groups" | "lastActive") {
    if (sortField === field) {
      if (sortDirection === "asc") setSortDirection("desc");
      else { setSortField(null); setSortDirection("asc"); }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function SortIcon({ field }: { field: "name" | "groups" | "lastActive" }) {
    if (sortField !== field) return null;
    return sortDirection === "asc"
      ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
      : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
  }

  const getInitials = useCallback((name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, []);

  const formatDate = useCallback(
    (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString(dateLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    },
    [dateLocale]
  );

  const exportCSV = useCallback(() => {
    const header = "Name,Phone,Groups,Status";
    const rows = filtered.map((u) => {
      const status = u.groupCount > 0 ? "Active" : "No Groups";
      const name = u.full_name.includes(",")
        ? `"${u.full_name}"`
        : u.full_name;
      return `${name},${u.phone ?? ""},${u.groupCount},${status}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
        <Users className="h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">{t("noDataYet")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("users")}</h1>
          <p className="text-muted-foreground">{t("usersSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          {t("exportCsv")}
        </Button>
      </div>

      {/* Search + Status Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchUsers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
        />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as "all" | "active" | "noGroups") ?? "all")}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="active">{t("activeUsers")}</SelectItem>
            <SelectItem value="noGroups">{t("noGroupsUsers")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("totalUsers")}
              </p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-bold">{stats.total}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("activeUsers")}
              </p>
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-bold">{stats.active}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("noGroupsUsers")}
              </p>
              <UserX className="h-4 w-4 text-orange-500" />
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-bold">{stats.noGroups}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("newThisMonth")}
              </p>
              <UserPlus className="h-4 w-4 text-blue-500" />
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-bold">{stats.newThisMonth}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-4 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("noUsers")}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                      {t("userName")}<SortIcon field="name" />
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("userEmail")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("userPhone")}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("groups")}>
                      {t("groupsCount")}<SortIcon field="groups" />
                    </TableHead>
                    <TableHead className="hidden lg:table-cell cursor-pointer select-none" onClick={() => toggleSort("lastActive")}>
                      {t("lastActive")}<SortIcon field="lastActive" />
                    </TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((user) => {
                    const initials = getInitials(user.full_name);
                    const isActive = user.groupCount > 0;
                    return (
                      <TableRow key={user.id}>
                        {/* Name + Avatar */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                                {initials || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-sm font-medium max-w-[160px]">
                              {user.full_name || "\u2014"}
                            </span>
                          </div>
                        </TableCell>

                        {/* Email */}
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {"\u2014"}
                        </TableCell>

                        {/* Phone */}
                        <TableCell className="hidden md:table-cell text-sm">
                          {user.phone || "\u2014"}
                        </TableCell>

                        {/* Groups */}
                        <TableCell>
                          <div>
                            <span className="text-sm font-medium">
                              {user.groupCount}
                            </span>
                            {user.adminGroupCount > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {user.adminGroupCount} admin
                              </p>
                            )}
                          </div>
                        </TableCell>

                        {/* Last Active */}
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(user.updated_at)}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {isActive ? (
                            <Badge variant="default" className="text-xs">
                              {t("statusActive")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {t("noGroupsUsers")}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted focus:outline-none">
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {}}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {t("viewDetails")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {}}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                {t("suspendUser")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {}}
                              >
                                <UserCog className="mr-2 h-4 w-4" />
                                {t("impersonate")}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {t("showingRange", {
                    from: page * PAGE_SIZE + 1,
                    to: Math.min((page + 1) * PAGE_SIZE, filtered.length),
                    total: filtered.length,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                  >
                    {t("next")}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
