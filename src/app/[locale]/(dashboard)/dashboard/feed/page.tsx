"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Pin, ThumbsUp, Heart, PartyPopper } from "lucide-react";
import { useActivityFeed, useAddFeedReaction } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { createClient } from "@/lib/supabase/client";

type Reaction = "thumbsup" | "heart" | "tada";

const REACTIONS: { key: Reaction; emoji: string; icon: typeof ThumbsUp }[] = [
  { key: "thumbsup", emoji: "\ud83d\udc4d", icon: ThumbsUp },
  { key: "heart", emoji: "\u2764\ufe0f", icon: Heart },
  { key: "tada", emoji: "\ud83c\udf89", icon: PartyPopper },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export default function FeedPage() {
  const t = useTranslations("feed");
  const { isAdmin, currentMembership } = useGroup();
  const { data: feedItems, isLoading, isError, error, refetch } = useActivityFeed();
  const addReaction = useAddFeedReaction();
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(30);

  const handlePin = async (itemId: string, currentlyPinned: boolean) => {
    setPinningId(itemId);
    try {
      const supabase = createClient();
      await supabase
        .from("activity_feed")
        .update({ pinned: !currentlyPinned })
        .eq("id", itemId);
      refetch();
    } finally {
      setPinningId(null);
    }
  };

  const handleReaction = (feedItemId: string, reaction: string) => {
    addReaction.mutate({ feedItemId, reaction });
  };

  if (isLoading) return <ListSkeleton rows={6} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  if (!feedItems || feedItems.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={Activity}
          title={t("noActivity")}
          description={t("noActivityDesc")}
        />
      </div>
    );
  }

  const ENTITY_FILTERS: { key: string; labelKey: string }[] = [
    { key: "all", labelKey: "filterAll" },
    { key: "payment", labelKey: "filterPayments" },
    { key: "membership", labelKey: "filterMembers" },
    { key: "event", labelKey: "filterEvents" },
    { key: "meeting_minutes", labelKey: "filterMinutes" },
    { key: "election", labelKey: "filterElections" },
    { key: "dispute", labelKey: "filterDisputes" },
  ];

  const filteredFeed = useMemo(() => {
    if (!feedItems) return [];
    if (typeFilter === "all") return feedItems;
    return feedItems.filter((item: Record<string, unknown>) => item.entity_type === typeFilter);
  }, [feedItems, typeFilter]);

  const pinnedItems = filteredFeed.filter((item: Record<string, unknown>) => item.pinned);
  const regularItems = filteredFeed.filter((item: Record<string, unknown>) => !item.pinned);
  const visibleRegularItems = regularItems.slice(0, visibleCount);
  const hasMore = regularItems.length > visibleCount;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header + Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? "all"); setVisibleCount(30); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>{t(f.labelKey as "filterAll")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pinned Items */}
      {pinnedItems.length > 0 && (
        <section className="flex flex-col gap-3">
          {pinnedItems.map((item: Record<string, unknown>) => (
            <FeedItem
              key={item.id as string}
              item={item}
              isPinned
              isAdmin={isAdmin}
              currentMembershipId={currentMembership?.id || null}
              onPin={handlePin}
              onReaction={handleReaction}
              pinningId={pinningId}
              t={t}
            />
          ))}
        </section>
      )}

      {/* Timeline */}
      <section className="flex flex-col gap-3">
        {visibleRegularItems.length === 0 && pinnedItems.length === 0 ? (
          <EmptyState icon={Activity} title={t("noActivity")} description={t("noActivityDesc")} />
        ) : (
          visibleRegularItems.map((item: Record<string, unknown>) => (
            <FeedItem
              key={item.id as string}
              item={item}
              isPinned={false}
              isAdmin={isAdmin}
              currentMembershipId={currentMembership?.id || null}
              onPin={handlePin}
              onReaction={handleReaction}
              pinningId={pinningId}
              t={t}
            />
          ))
        )}
      </section>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setVisibleCount((c) => c + 30)}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeedItem({
  item,
  isPinned,
  isAdmin,
  currentMembershipId,
  onPin,
  onReaction,
  pinningId,
  t,
}: {
  item: Record<string, unknown>;
  isPinned: boolean;
  isAdmin: boolean;
  currentMembershipId: string | null;
  onPin: (id: string, pinned: boolean) => void;
  onReaction: (feedItemId: string, reaction: string) => void;
  pinningId: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const id = item.id as string;
  const message = (item.action_message as string) || "";
  const createdAt = (item.created_at as string) || "";
  const pinned = !!item.pinned;

  const actor = item.actor as Record<string, unknown> | undefined;
  const profile = actor
    ? ((Array.isArray(actor.profiles) ? actor.profiles[0] : actor.profiles) as Record<string, unknown> | undefined)
    : undefined;
  const actorName = (profile?.full_name as string) || "Member";
  const avatarUrl = profile?.avatar_url as string | null;

  const reactions = (item.reactions as Record<string, unknown>[]) || [];

  // Count reactions per type
  const reactionCounts: Record<string, number> = {};
  const userReactions: Set<string> = new Set();
  for (const r of reactions) {
    const type = r.reaction as string;
    reactionCounts[type] = (reactionCounts[type] || 0) + 1;
    if (r.membership_id === currentMembershipId) {
      userReactions.add(type);
    }
  }

  return (
    <Card className={isPinned ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Avatar */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={actorName}
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {getInitials(actorName)}
            </div>
          )}

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{actorName}</span>
                {isPinned && (
                  <Badge variant="outline" className="gap-1 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
                    <Pin className="size-3" />
                    {t("pinned")}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("timeAgo", { time: timeAgo(createdAt) })}
                </span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onPin(id, pinned)}
                    disabled={pinningId === id}
                  >
                    <Pin className={`size-3.5 ${pinned ? "fill-current" : ""}`} />
                    <span className="ml-1 hidden sm:inline">{pinned ? t("unpin") : t("pin")}</span>
                  </Button>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{message}</p>

            {/* Reactions */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {REACTIONS.map(({ key, emoji }) => {
                const count = reactionCounts[key] || 0;
                const hasReacted = userReactions.has(key);
                return (
                  <Button
                    key={key}
                    variant={hasReacted ? "default" : "outline"}
                    size="sm"
                    className={`h-7 gap-1 px-2 text-xs ${
                      hasReacted
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border-emerald-300 dark:border-emerald-700"
                        : ""
                    }`}
                    onClick={() => onReaction(id, key)}
                  >
                    <span>{emoji}</span>
                    {count > 0 && <span>{count}</span>}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
