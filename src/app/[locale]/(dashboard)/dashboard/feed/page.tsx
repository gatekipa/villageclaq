"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
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
import {
  Activity,
  Pin,
  ThumbsUp,
  Heart,
  PartyPopper,
  DollarSign,
  UserPlus,
  Calendar,
  FileText,
  Vote,
  Scale,
  Megaphone,
} from "lucide-react";
import { useActivityFeed, useAddFeedReaction } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { createClient } from "@/lib/supabase/client";
import { getMemberName } from "@/lib/get-member-name";
import { formatAmount } from "@/lib/currencies";

type Reaction = "thumbsup" | "heart" | "tada";

const REACTIONS: { key: Reaction; emoji: string; icon: typeof ThumbsUp }[] = [
  { key: "thumbsup", emoji: "\ud83d\udc4d", icon: ThumbsUp },
  { key: "heart", emoji: "\u2764\ufe0f", icon: Heart },
  { key: "tada", emoji: "\ud83c\udf89", icon: PartyPopper },
];

const ICON_MAP: Record<string, typeof Activity> = {
  payment: DollarSign,
  membership: UserPlus,
  event: Calendar,
  meeting_minutes: FileText,
  election: Vote,
  dispute: Scale,
  announcement: Megaphone,
};

const COLOR_MAP: Record<string, string> = {
  payment: "text-emerald-500",
  membership: "text-blue-500",
  event: "text-purple-500",
  meeting_minutes: "text-indigo-500",
  election: "text-teal-500",
  dispute: "text-red-500",
  announcement: "text-orange-500",
};

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

interface FeedItem {
  id: string;
  entity_type: string;
  message: string;
  actor_name: string;
  actor_avatar: string | null;
  created_at: string;
  pinned: boolean;
  // For activity_feed table items, carry reactions
  reactions?: Record<string, unknown>[];
  _source: "table" | "aggregated";
}

/**
 * Hook to aggregate activity from multiple real tables.
 * Used as fallback when the activity_feed table is empty.
 */
function useAggregatedFeed(enabled: boolean) {
  const { groupId, currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";

  return useQuery<FeedItem[]>({
    queryKey: ["aggregated-feed", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const items: FeedItem[] = [];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Recent payments
      const { data: payments } = await supabase
        .from("payments")
        .select("id, amount, currency, recorded_at, membership:memberships!inner(id, display_name, is_proxy, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, avatar_url)), contribution_type:contribution_types(id, name, name_fr)")
        .eq("group_id", groupId)
        .gte("recorded_at", thirtyDaysAgo)
        .order("recorded_at", { ascending: false })
        .limit(25);

      for (const p of (payments || []) as Record<string, unknown>[]) {
        const m = p.membership as Record<string, unknown>;
        const profile = (Array.isArray(m?.profiles) ? m.profiles[0] : m?.profiles) as Record<string, unknown> | undefined;
        const ct = p.contribution_type as Record<string, unknown> | null;
        items.push({
          id: `payment-${p.id}`,
          entity_type: "payment",
          message: `${getMemberName(m)} paid ${formatAmount(Number(p.amount), (p.currency as string) || currency)} for ${(ct?.name as string) || "contribution"}`,
          actor_name: getMemberName(m),
          actor_avatar: (profile?.avatar_url as string) || null,
          created_at: p.recorded_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // 2. New members (last 30 days)
      const { data: newMembers } = await supabase
        .from("memberships")
        .select("id, display_name, is_proxy, joined_at, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, avatar_url)")
        .eq("group_id", groupId)
        .gte("joined_at", thirtyDaysAgo)
        .order("joined_at", { ascending: false })
        .limit(25);

      for (const m of (newMembers || []) as Record<string, unknown>[]) {
        const profile = (Array.isArray(m?.profiles) ? m.profiles[0] : m?.profiles) as Record<string, unknown> | undefined;
        items.push({
          id: `member-${m.id}`,
          entity_type: "membership",
          message: `${getMemberName(m)} joined the group`,
          actor_name: getMemberName(m),
          actor_avatar: (profile?.avatar_url as string) || null,
          created_at: m.joined_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // 3. Events created
      const { data: events } = await supabase
        .from("events")
        .select("id, title, starts_at, created_at")
        .eq("group_id", groupId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(15);

      for (const e of (events || []) as Record<string, unknown>[]) {
        items.push({
          id: `event-${e.id}`,
          entity_type: "event",
          message: `Event "${e.title}" scheduled for ${new Date(e.starts_at as string).toLocaleDateString()}`,
          actor_name: "System",
          actor_avatar: null,
          created_at: e.created_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // 4. Announcements
      const { data: announcements } = await supabase
        .from("announcements")
        .select("id, title, created_at")
        .eq("group_id", groupId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const a of (announcements || []) as Record<string, unknown>[]) {
        items.push({
          id: `announcement-${a.id}`,
          entity_type: "announcement",
          message: `Announcement: "${a.title}"`,
          actor_name: "System",
          actor_avatar: null,
          created_at: a.created_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // 5. Published minutes
      const { data: minutes } = await supabase
        .from("meeting_minutes")
        .select("id, title, published_at")
        .eq("group_id", groupId)
        .eq("status", "published")
        .not("published_at", "is", null)
        .gte("published_at", thirtyDaysAgo)
        .order("published_at", { ascending: false })
        .limit(10);

      for (const m of (minutes || []) as Record<string, unknown>[]) {
        items.push({
          id: `minutes-${m.id}`,
          entity_type: "meeting_minutes",
          message: `Meeting minutes "${m.title}" published`,
          actor_name: "System",
          actor_avatar: null,
          created_at: m.published_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // 6. Elections
      const { data: elections } = await supabase
        .from("elections")
        .select("id, title, status, created_at")
        .eq("group_id", groupId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const e of (elections || []) as Record<string, unknown>[]) {
        const statusText = e.status === "open" ? "voting is now open" : e.status === "closed" ? "voting has been closed" : "was created";
        items.push({
          id: `election-${e.id}`,
          entity_type: "election",
          message: `Election "${e.title}" ${statusText}`,
          actor_name: "System",
          actor_avatar: null,
          created_at: e.created_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // 7. Disputes
      const { data: disputes } = await supabase
        .from("disputes")
        .select("id, title, created_at")
        .eq("group_id", groupId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const d of (disputes || []) as Record<string, unknown>[]) {
        items.push({
          id: `dispute-${d.id}`,
          entity_type: "dispute",
          message: `Dispute filed: "${d.title}"`,
          actor_name: "System",
          actor_avatar: null,
          created_at: d.created_at as string,
          pinned: false,
          _source: "aggregated",
        });
      }

      // Sort by date descending
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return items;
    },
    enabled: enabled && !!groupId,
    staleTime: 2 * 60 * 1000,
  });
}

export default function FeedPage() {
  const t = useTranslations("feed");
  const { isAdmin, currentMembership } = useGroup();
  const { data: feedTableItems, isLoading: tableLoading, isError, error, refetch } = useActivityFeed();
  const addReaction = useAddFeedReaction();
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(30);

  // Use aggregated feed as fallback when activity_feed table is empty
  const tableIsEmpty = !tableLoading && (!feedTableItems || feedTableItems.length === 0);
  const { data: aggregatedItems, isLoading: aggLoading } = useAggregatedFeed(tableIsEmpty);

  const isLoading = tableLoading || (tableIsEmpty && aggLoading);

  // Convert table items to unified FeedItem format
  const allFeedItems = useMemo<FeedItem[]>(() => {
    // If activity_feed table has data, use it
    if (feedTableItems && feedTableItems.length > 0) {
      return feedTableItems.map((item: Record<string, unknown>) => {
        const actor = item.actor as Record<string, unknown> | undefined;
        const profile = actor
          ? ((Array.isArray(actor.profiles) ? actor.profiles[0] : actor.profiles) as Record<string, unknown> | undefined)
          : undefined;
        return {
          id: item.id as string,
          entity_type: (item.entity_type as string) || "",
          message: (item.message as string) || (item.action_message as string) || "",
          actor_name: (profile?.full_name as string) || "Member",
          actor_avatar: (profile?.avatar_url as string) || null,
          created_at: (item.created_at as string) || "",
          pinned: !!item.pinned,
          reactions: (item.reactions as Record<string, unknown>[]) || [],
          _source: "table" as const,
        };
      });
    }

    // Fallback: use aggregated data from real tables
    return aggregatedItems || [];
  }, [feedTableItems, aggregatedItems]);

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

  const ENTITY_FILTERS: { key: string; labelKey: string }[] = [
    { key: "all", labelKey: "filterAll" },
    { key: "payment", labelKey: "filterPayments" },
    { key: "membership", labelKey: "filterMembers" },
    { key: "event", labelKey: "filterEvents" },
    { key: "meeting_minutes", labelKey: "filterMinutes" },
    { key: "election", labelKey: "filterElections" },
    { key: "dispute", labelKey: "filterDisputes" },
  ];

  const filteredFeed = typeFilter === "all"
    ? allFeedItems
    : allFeedItems.filter((item) => item.entity_type === typeFilter);

  const pinnedItems = filteredFeed.filter((item) => item.pinned);
  const regularItems = filteredFeed.filter((item) => !item.pinned);
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

      {filteredFeed.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={t("noActivity")}
          description={t("noActivityDesc")}
        />
      ) : (
        <>
          {/* Pinned Items */}
          {pinnedItems.length > 0 && (
            <section className="flex flex-col gap-3">
              {pinnedItems.map((item) => (
                <FeedItemCard
                  key={item.id}
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
            {visibleRegularItems.map((item) => (
              <FeedItemCard
                key={item.id}
                item={item}
                isPinned={false}
                isAdmin={isAdmin}
                currentMembershipId={currentMembership?.id || null}
                onPin={handlePin}
                onReaction={handleReaction}
                pinningId={pinningId}
                t={t}
              />
            ))}
          </section>
        </>
      )}

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

function FeedItemCard({
  item,
  isPinned,
  isAdmin,
  currentMembershipId,
  onPin,
  onReaction,
  pinningId,
  t,
}: {
  item: FeedItem;
  isPinned: boolean;
  isAdmin: boolean;
  currentMembershipId: string | null;
  onPin: (id: string, pinned: boolean) => void;
  onReaction: (feedItemId: string, reaction: string) => void;
  pinningId: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = ICON_MAP[item.entity_type] || Activity;
  const iconColor = COLOR_MAP[item.entity_type] || "text-muted-foreground";
  const isFromTable = item._source === "table";

  // Reactions only for table-sourced items
  const reactions = item.reactions || [];
  const reactionCounts: Record<string, number> = {};
  const userReactions = new Set<string>();
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
          {/* Icon / Avatar */}
          {item.actor_avatar ? (
            <img
              src={item.actor_avatar}
              alt={item.actor_name}
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-muted ${iconColor}`}>
              <Icon className="size-5" />
            </div>
          )}

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.actor_name}</span>
                {isPinned && (
                  <Badge variant="outline" className="gap-1 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
                    <Pin className="size-3" />
                    {t("pinned")}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("timeAgo", { time: timeAgo(item.created_at) })}
                </span>
                {isAdmin && isFromTable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onPin(item.id, item.pinned)}
                    disabled={pinningId === item.id}
                  >
                    <Pin className={`size-3.5 ${item.pinned ? "fill-current" : ""}`} />
                    <span className="ml-1 hidden sm:inline">{item.pinned ? t("unpin") : t("pin")}</span>
                  </Button>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{item.message}</p>

            {/* Reactions — only for table-sourced items */}
            {isFromTable && (
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
                      onClick={() => onReaction(item.id, key)}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span>{count}</span>}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
