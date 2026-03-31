"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bug,
  Lightbulb,
  MessageSquare,
  Plus,
  ThumbsUp,
  ImagePlus,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type FeedbackType = "bug" | "feature" | "general";
type Severity = "low" | "medium" | "high" | "critical";
type FeedbackStatus =
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "shipped"
  | "closed";

interface FeedbackItem {
  id: string;
  user_id: string;
  type: FeedbackType;
  severity: Severity | null;
  title: string;
  description: string;
  status: FeedbackStatus;
  upvotes: number;
  created_at: string;
}

interface FeedbackVote {
  id: string;
  feedback_id: string;
  user_id: string;
}

const TYPE_CONFIG: Record<
  FeedbackType,
  { icon: typeof Bug; color: string; badgeVariant: "destructive" | "default" | "secondary" }
> = {
  bug: { icon: Bug, color: "text-red-500", badgeVariant: "destructive" },
  feature: { icon: Lightbulb, color: "text-blue-500", badgeVariant: "default" },
  general: { icon: MessageSquare, color: "text-gray-500", badgeVariant: "secondary" },
};

const SEVERITY_COLORS: Record<Severity, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  submitted: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  planned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  shipped: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function useFeedback() {
  return useQuery({
    queryKey: ["feedback"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as FeedbackItem[];
    },
  });
}

function useUserVotes() {
  return useQuery({
    queryKey: ["feedback-votes"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("feedback_votes")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data as FeedbackVote[];
    },
  });
}

export default function FeedbackPage() {
  const locale = useLocale();
  const t = useTranslations("feedback");
  const queryClient = useQueryClient();
  const { data: feedbackItems, isLoading, isError, error, refetch } = useFeedback();
  const { data: userVotes } = useUserVotes();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState<FeedbackType>("general");
  const [formSeverity, setFormSeverity] = useState<Severity>("medium");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const votedFeedbackIds = new Set(
    (userVotes || []).map((v) => v.feedback_id)
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("feedback").insert({
        user_id: user.id,
        type: formType,
        severity: formType === "bug" ? formSeverity : null,
        title: formTitle,
        description: formDescription,
        status: "submitted",
        upvotes: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      setDialogOpen(false);
      setFormTitle("");
      setFormDescription("");
      setFormType("general");
      setFormSeverity("medium");
    },
  });

  const upvoteMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("feedback_votes").insert({
        feedback_id: feedbackId,
        user_id: user.id,
      });
      const item = feedbackItems?.find((f) => f.id === feedbackId);
      if (item) {
        await supabase
          .from("feedback")
          .update({ upvotes: (item.upvotes || 0) + 1 })
          .eq("id", feedbackId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-votes"] });
    },
  });

  const filterByTab = (items: FeedbackItem[], tab: string) => {
    if (tab === "all") return items;
    return items.filter((item) => item.type === tab);
  };

  if (isLoading) return <ListSkeleton rows={6} />;
  if (isError)
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );

  const renderFeedbackCards = (items: FeedbackItem[]) => {
    if (items.length === 0) {
      return (
        <EmptyState
          icon={MessageSquare}
          title={t("noFeedback")}
          description={t("noFeedbackDesc")}
        />
      );
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          const typeConfig = TYPE_CONFIG[item.type];
          const TypeIcon = typeConfig.icon;
          const hasVoted = votedFeedbackIds.has(item.id);

          return (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Upvote */}
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <Button
                      variant={hasVoted ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={hasVoted || upvoteMutation.isPending}
                      onClick={() => upvoteMutation.mutate(item.id)}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs font-medium tabular-nums">
                      {item.upvotes || 0}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm leading-snug">
                        {item.title}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={typeConfig.badgeVariant} className="text-xs">
                        <TypeIcon className="h-3 w-3 mr-1" />
                        {t(item.type === "feature" ? "featureRequests" : item.type === "bug" ? "bugReports" : "general")}
                      </Badge>
                      {item.type === "bug" && item.severity && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[item.severity]}`}
                        >
                          {t(`severity_${item.severity}` as const)}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status]}`}
                      >
                        {t(`status_${item.status}` as const)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              {t("submitFeedback")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("submitFeedback")}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t("type")}</Label>
                <Select
                  value={formType}
                  onValueChange={(v) => setFormType(v as FeedbackType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">{t("bugReports")}</SelectItem>
                    <SelectItem value="feature">{t("featureRequests")}</SelectItem>
                    <SelectItem value="general">{t("general")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formType === "bug" && (
                <div className="space-y-2">
                  <Label>{t("severity")}</Label>
                  <Select
                    value={formSeverity}
                    onValueChange={(v) => setFormSeverity(v as Severity)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t("severity_low")}</SelectItem>
                      <SelectItem value="medium">{t("severity_medium")}</SelectItem>
                      <SelectItem value="high">{t("severity_high")}</SelectItem>
                      <SelectItem value="critical">{t("severity_critical")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("title")}</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>{t("screenshot")}</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground hover:border-primary/50 transition-colors cursor-pointer">
                  <ImagePlus className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">{t("screenshot")}</p>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitMutation.isPending || !formTitle}
              >
                {submitMutation.isPending ? "..." : t("submitFeedback")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">{t("allFeedback")}</TabsTrigger>
          <TabsTrigger value="bug">{t("bugReports")}</TabsTrigger>
          <TabsTrigger value="feature">{t("featureRequests")}</TabsTrigger>
          <TabsTrigger value="general">{t("general")}</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {renderFeedbackCards(filterByTab(feedbackItems || [], "all"))}
        </TabsContent>
        <TabsContent value="bug" className="mt-4">
          {renderFeedbackCards(filterByTab(feedbackItems || [], "bug"))}
        </TabsContent>
        <TabsContent value="feature" className="mt-4">
          {renderFeedbackCards(filterByTab(feedbackItems || [], "feature"))}
        </TabsContent>
        <TabsContent value="general" className="mt-4">
          {renderFeedbackCards(filterByTab(feedbackItems || [], "general"))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
