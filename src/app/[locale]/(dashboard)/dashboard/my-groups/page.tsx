"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useGroup, type GroupMembership } from "@/lib/group-context";
import { GroupTypeBadge } from "@/components/layout/group-type-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ListSkeleton,
  EmptyState,
} from "@/components/ui/page-skeleton";
import {
  LayoutGrid,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  Crown,
  ShieldCheck,
  ShieldHalf,
  UserRound,
  Loader2,
} from "lucide-react";

type Role = "owner" | "admin" | "moderator" | "member";

const roleConfig: Record<Role, { key: string; icon: typeof Crown; color: string }> = {
  owner: {
    key: "roleOwner",
    icon: Crown,
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  admin: {
    key: "roleAdmin",
    icon: ShieldCheck,
    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  moderator: {
    key: "roleModerator",
    icon: ShieldHalf,
    color: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  },
  member: {
    key: "roleMember",
    icon: UserRound,
    color: "bg-muted text-muted-foreground",
  },
};

export default function MyGroupsPage() {
  const t = useTranslations("myGroups");
  const { memberships, groupId, switchGroup, loading } = useGroup();

  // Sort so the current group surfaces first, then by join recency
  // (memberships already arrive newest-first from GroupProvider).
  const ordered = useMemo(() => {
    const current = memberships.filter((m) => m.group_id === groupId);
    const rest = memberships.filter((m) => m.group_id !== groupId);
    return [...current, ...rest];
  }, [memberships, groupId]);

  if (loading) return <ListSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        </div>
        <p className="text-muted-foreground">
          {memberships.length === 1
            ? t("subtitleOne")
            : t("subtitle", { count: memberships.length })}
        </p>
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((m) => (
            <GroupCard
              key={m.id}
              membership={m}
              isCurrent={m.group_id === groupId}
              onSwitch={() => switchGroup(m.group_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  membership,
  isCurrent,
  onSwitch,
}: {
  membership: GroupMembership;
  isCurrent: boolean;
  onSwitch: () => void;
}) {
  const t = useTranslations("myGroups");
  const [switching, setSwitching] = useState(false);

  const role = (membership.role || "member") as Role;
  const rc = roleConfig[role] ?? roleConfig.member;
  const RoleIcon = rc.icon;
  const groupName = membership.group?.name || t("untitledGroup");
  const level = membership.group?.group_level ?? null;
  const isPending = membership.membership_status === "pending_approval";

  return (
    <Card
      className={cn(
        "flex flex-col transition-colors",
        isCurrent && "border-primary ring-1 ring-primary/40",
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        {/* Top row: avatar + name + badges */}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-base font-semibold" title={groupName}>
                {groupName}
              </h2>
              <GroupTypeBadge level={level} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* Role badge */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  rc.color,
                )}
              >
                <RoleIcon className="size-3" aria-hidden="true" />
                {t(rc.key)}
              </span>

              {/* Pending approval marker */}
              {isPending && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] font-medium">
                  <Clock className="mr-1 size-3" aria-hidden="true" />
                  {t("pending")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Current marker / switch action */}
        <div className="mt-auto pt-1">
          {isCurrent ? (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t("current")}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => {
                setSwitching(true);
                onSwitch();
              }}
              disabled={isPending || switching}
            >
              <span>{isPending ? t("awaitingApproval") : t("switchCta")}</span>
              {switching ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                !isPending && <ArrowRight className="size-4" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
