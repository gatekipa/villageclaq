"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  CheckCircle2,
  ListChecks,
  Users,
  Eye,
  Share2,
  Download,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useMeetingMinutes } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function MinutesPage() {
  const t = useTranslations("minutes");
  const tc = useTranslations("common");
  const { data: minutes, isLoading, isError, error, refetch } = useMeetingMinutes();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState<Record<string, unknown> | null>(null);

  if (isLoading) {
    return <ListSkeleton rows={5} />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  const allMinutes = (minutes || []) as Record<string, unknown>[];

  const filtered = allMinutes.filter((m) => {
    const status = (m.status as string) || "draft";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const event = m.event as Record<string, unknown> | null;
      const title = (event?.title as string) || "";
      return title.toLowerCase().includes(q);
    }
    return true;
  });

  const getEventTitle = (m: Record<string, unknown>) => {
    const event = m.event as Record<string, unknown> | null;
    return (event?.title as string) || "—";
  };

  const getEventDate = (m: Record<string, unknown>) => {
    const event = m.event as Record<string, unknown> | null;
    return (event?.starts_at as string) || (m.created_at as string) || "";
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchMinutes")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            {tc("all")}
          </Button>
          <Button
            variant={statusFilter === "draft" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("draft")}
          >
            {tc("draft")}
          </Button>
          <Button
            variant={statusFilter === "published" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("published")}
          >
            {tc("published")}
          </Button>
        </div>
      </div>

      {/* Minutes List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("noMinutes")}
          description={t("noMinutesDesc")}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const id = m.id as string;
            const status = (m.status as string) || "draft";
            const eventTitle = getEventTitle(m);
            const eventDate = getEventDate(m);
            const publishedAt = m.published_at as string | null;
            const isExpanded = expandedId === id;

            const contentJson = m.content_json as Record<string, unknown>[] | null;
            const decisionsJson = m.decisions_json as Record<string, unknown>[] | null;
            const actionItemsJson = m.action_items_json as Record<string, unknown>[] | null;

            return (
              <Card key={id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                        {eventDate ? (
                          <>
                            <span className="text-xs font-medium text-primary">
                              {new Date(eventDate).toLocaleDateString("en", { month: "short" })}
                            </span>
                            <span className="text-lg font-bold leading-none text-primary">
                              {new Date(eventDate).getDate()}
                            </span>
                          </>
                        ) : (
                          <FileText className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{eventTitle}</h3>
                          <Badge variant={status === "published" ? "default" : "secondary"}>
                            {status === "published" ? tc("published") : tc("draft")}
                          </Badge>
                        </div>
                        {status === "published" && publishedAt && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("publishedOn", { date: formatDate(publishedAt) })}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {decisionsJson && decisionsJson.length > 0 && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              {decisionsJson.length} {t("decisions").toLowerCase()}
                            </span>
                          )}
                          {actionItemsJson && actionItemsJson.length > 0 && (
                            <span className="flex items-center gap-1">
                              <ListChecks className="h-3.5 w-3.5 text-primary" />
                              {actionItemsJson.length} {t("actionItems").toLowerCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpand(id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="mr-1 h-3.5 w-3.5" />
                      )}
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {/* Content / Discussion Summary */}
                      {contentJson && contentJson.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <MessageSquare className="h-4 w-4" />
                            {t("discussionSummary")}
                          </h4>
                          <div className="mt-2 space-y-1">
                            {contentJson.map((item, i) => (
                              <p key={i} className="text-sm text-muted-foreground">
                                {(item.text as string) || (item.content as string) || JSON.stringify(item)}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Decisions */}
                      {decisionsJson && decisionsJson.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            {t("decisions")}
                          </h4>
                          <div className="mt-2 space-y-2">
                            {decisionsJson.map((decision, i) => (
                              <div key={i} className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                  {i + 1}
                                </div>
                                <p className="text-sm">
                                  {(decision.text as string) || (decision.decision as string) || JSON.stringify(decision)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Items */}
                      {actionItemsJson && actionItemsJson.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <ListChecks className="h-4 w-4" />
                            {t("actionItems")}
                          </h4>
                          <div className="mt-2 space-y-2">
                            {actionItemsJson.map((item, i) => {
                              const completed = item.completed as boolean;
                              const assignee = item.assignee as string | null;
                              const dueDate = item.due_date as string | null;
                              return (
                                <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                                  <div
                                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                                      completed
                                        ? "border-primary bg-primary"
                                        : "border-muted-foreground/30"
                                    }`}
                                  >
                                    {completed && (
                                      <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <p
                                      className={`text-sm ${
                                        completed ? "line-through text-muted-foreground" : ""
                                      }`}
                                    >
                                      {(item.text as string) || (item.task as string) || JSON.stringify(item)}
                                    </p>
                                    <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                                      {assignee && <span>{assignee}</span>}
                                      {dueDate && (
                                        <>
                                          <span>·</span>
                                          <span>{formatDate(dueDate)}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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
