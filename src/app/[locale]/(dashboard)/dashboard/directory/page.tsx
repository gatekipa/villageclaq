"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-skeleton";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";
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
  Mail,
  Phone,
  Calendar,
  Star,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  LayoutList,
  LayoutGrid,
} from "lucide-react";

const roleBadgeStyles: Record<string, string> = {
  owner:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  admin:
    "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  moderator:
    "bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  member:
    "bg-gray-500/10 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
};

const avatarGradients: string[] = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-600",
  "from-cyan-500 to-blue-600",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isNewMember(joinedAt: string): boolean {
  const joined = new Date(joinedAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return joined >= sevenDaysAgo;
}

function getGradient(index: number): string {
  return avatarGradients[index % avatarGradients.length];
}

const filterRoles = ["all", "owner", "admin", "moderator", "member"] as const;

export default function DirectoryPage() {
  const locale = useLocale();
  const t = useTranslations();
  const { groupId } = useGroup();
  const { data: members = [], isLoading, error, refetch } = useMembers();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    setPage(1); // Reset page when filters change
    return members.filter((m: Record<string, unknown>) => {
      const name = getMemberName(m).toLowerCase();
      const matchesSearch = name.includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [members, search, roleFilter]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("directory.title")}
        </h1>
        <p className="text-muted-foreground">{t("directory.subtitle")}</p>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("directory.searchMembers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {filterRoles.map((role) => (
            <option key={role} value={role}>
              {role === "all"
                ? t("directory.allRoles")
                : t(`roles.${role}`)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="w-fit">
            <Users className="mr-1 h-3 w-3" />
            {t("directory.membersCount", { count: filtered.length })}
          </Badge>
          <div className="flex rounded-md border">
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("table")}>
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Members */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {t("directory.noResults")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("directory.noResultsDesc")}
          </p>
        </div>
      ) : viewMode === "table" ? (
        <>
          {/* Table View */}
          {(() => {
            const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
            const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            const showFrom = (page - 1) * PAGE_SIZE + 1;
            const showTo = Math.min(page * PAGE_SIZE, filtered.length);
            return (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{t("directory.name")}</TableHead>
                        <TableHead>{t("directory.role")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("directory.email")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("directory.phone")}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t("directory.joined")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((member: Record<string, unknown>, index: number) => {
                        const profile = member.profile as Record<string, unknown> | undefined;
                        const memberName = getMemberName(member);
                        const memberRole = (member.role as string) || "member";
                        const joinedAt = member.joined_at as string;
                        const privacySettings = (member.privacy_settings || {}) as Record<string, boolean>;
                        const initials = memberName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                        return (
                          <TableRow key={member.id as string}>
                            <TableCell>
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={(profile?.avatar_url as string) || undefined} />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                              </Avatar>
                            </TableCell>
                            <TableCell className="font-medium">{memberName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs capitalize ${roleBadgeStyles[memberRole] || ""}`}>
                                {t(`roles.${memberRole}`)}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                              {privacySettings.show_email && (profile?.email as string) ? String(profile?.email) : "—"}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                              {privacySettings.show_phone && (profile?.phone as string) ? String(profile?.phone) : "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                              {joinedAt ? new Date(joinedAt).toLocaleDateString(getDateLocale(locale)) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {showFrom}–{showTo} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        {t("common.previous")}
                      </Button>
                      <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                        {t("common.next")}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member: Record<string, unknown>, index: number) => {
            const profile = member.profile as Record<string, unknown> | undefined;
            const memberName = getMemberName(member);
            const memberRole = (member.role as string) || "member";
            const joinedAt = member.joined_at as string;
            const privacySettings = (member.privacy_settings || {}) as Record<string, boolean>;
            const isExpanded = selectedMemberId === (member.id as string);
            const isNew = joinedAt && isNewMember(joinedAt);
            const gradient = getGradient(index);

            return (
              <Card
                key={member.id as string}
                className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
                  isExpanded ? "ring-2 ring-primary/20" : ""
                }`}
                onClick={() =>
                  setSelectedMemberId(isExpanded ? null : (member.id as string))
                }
              >
                <CardContent className="p-4">
                  {/* Top section: avatar + name + role */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      {profile?.avatar_url ? (
                        <AvatarImage src={profile.avatar_url as string} alt={memberName} />
                      ) : null}
                      <AvatarFallback
                        className={`bg-gradient-to-br ${gradient} text-white font-semibold text-sm`}
                      >
                        {getInitials(memberName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {memberName}
                        </p>
                        {isNew && (
                          <Badge className="bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-0 text-[10px] px-1.5 py-0 shrink-0">
                            <Star className="mr-0.5 h-2.5 w-2.5" />
                            {t("directory.newMember")}
                          </Badge>
                        )}
                      </div>
                      <Badge
                        className={`mt-1 border-0 text-[11px] px-2 py-0.5 ${
                          roleBadgeStyles[memberRole] || roleBadgeStyles.member
                        }`}
                      >
                        {t(`roles.${memberRole}`)}
                      </Badge>
                    </div>
                    {/* Privacy-aware contact icons */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {privacySettings.show_phone && profile?.phone ? (
                        <div className="rounded-md bg-muted p-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Expand/collapse indicator */}
                  <div className="mt-3 flex items-center justify-center">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Expanded detail section */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {/* Member since */}
                      {joinedAt ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {t("directory.memberSince", {
                              date: new Date(joinedAt).toLocaleDateString(getDateLocale(locale), {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }),
                            })}
                          </span>
                        </div>
                      ) : null}

                      {/* Contact info - respect privacy */}
                      {privacySettings.show_phone && profile?.phone ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("directory.contactInfo")}
                          </p>
                          <div className="flex items-center gap-2 text-xs">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{profile.phone as string}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
