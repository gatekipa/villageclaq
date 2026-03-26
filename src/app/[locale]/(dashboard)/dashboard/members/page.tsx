"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput, getDefaultCountryCode } from "@/components/ui/phone-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import { useMembers } from "@/lib/hooks/use-supabase-query";
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

export default function MembersPage() {
  const t = useTranslations("members");
  const router = useRouter();
  const { isAdmin, groupId, user, currentGroup } = useGroup();
  const queryClient = useQueryClient();
  const { data: members, isLoading, isError, error, refetch } = useMembers();
  const [search, setSearch] = useState("");

  // Add member dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin" | "moderator">("member");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

      // Use the SECURITY DEFINER function to create proxy member
      // This bypasses RLS safely — the function verifies the caller is a group member
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
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m: Record<string, unknown>) => {
      const profile = m.profile as { full_name?: string } | undefined;
      const displayName = (m.display_name as string) || "";
      const fullName = profile?.full_name || "";
      return (
        fullName.toLowerCase().includes(q) ||
        displayName.toLowerCase().includes(q)
      );
    });
  }, [members, search]);

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
    // For proxy members, phone is in privacy_settings.proxy_phone
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
        {isAdmin && (
          <div className="flex gap-2">
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
          </div>
        )}
      </div>

      {/* Search + Count */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchMembers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member: Record<string, unknown>) => {
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
                    {/* Avatar */}
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
                          {name}
                        </p>
                        <RoleIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      </div>

                      {/* Role + Standing badges */}
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

                      {/* Phone */}
                      {phone ? (
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{String(phone)}</span>
                        </div>
                      ) : null}

                      {/* Joined date */}
                      {joinedAt && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(joinedAt)}</span>
                        </div>
                      )}

                      {/* Proxy badge */}
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
