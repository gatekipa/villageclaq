"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  BookOpen,
  Users,
  CreditCard,
  Calendar,
  BarChart3,
  UserCog,
  Wrench,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { Link } from "@/i18n/routing";

const CATEGORIES = [
  "getting_started",
  "members",
  "payments",
  "events",
  "reports",
  "account",
  "troubleshooting",
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_ICONS: Record<Category, typeof BookOpen> = {
  getting_started: BookOpen,
  members: Users,
  payments: CreditCard,
  events: Calendar,
  reports: BarChart3,
  account: UserCog,
  troubleshooting: Wrench,
};

interface HelpArticle {
  id: string;
  title: string;
  title_fr: string;
  content: string;
  content_fr: string;
  category: string;
  is_published: boolean;
  sort_order: number;
  helpful_yes: number;
  helpful_no: number;
  created_at: string;
}

function useHelpArticles() {
  return useQuery({
    queryKey: ["help-articles"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("help_articles")
        .select("*")
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      return data as HelpArticle[];
    },
  });
}

export default function HelpPage() {
  const t = useTranslations("help");
  const locale = useLocale();
  const { data: articles, isLoading, isError, error, refetch } = useHelpArticles();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean>>({});
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    return articles.filter((article) => {
      const title = locale === "fr" ? article.title_fr : article.title;
      const matchesSearch =
        !searchQuery ||
        title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" || article.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [articles, searchQuery, selectedCategory, locale]);

  const handleFeedback = async (articleId: string, helpful: boolean) => {
    if (feedbackGiven[articleId]) return;
    const supabase = createClient();
    const column = helpful ? "helpful_yes" : "helpful_no";
    const article = articles?.find((a) => a.id === articleId);
    if (!article) return;
    await supabase
      .from("help_articles")
      .update({ [column]: (article[column] || 0) + 1 })
      .eq("id", articleId);
    setFeedbackGiven((prev) => ({ ...prev, [articleId]: true }));
  };

  if (isLoading) return <ListSkeleton rows={6} />;
  if (isError)
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Categories - Mobile Dropdown */}
        <div className="lg:hidden">
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
          >
            <span>{t("categories")}</span>
            {mobileDropdownOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {mobileDropdownOpen && (
            <Card className="mt-2">
              <CardContent className="p-2">
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setMobileDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedCategory === "all"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {t("allCategories")}
                </button>
                {CATEGORIES.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setMobileDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                        selectedCategory === cat
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {t(cat)}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Categories - Desktop Sidebar */}
        <div className="hidden lg:block w-64 shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t("categories")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {t("allCategories")}
              </button>
              {CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(cat)}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Articles */}
        <div className="flex-1 space-y-4">
          {filteredArticles.length === 0 ? (
            <EmptyState
              icon={HelpCircle}
              title={t("noResults")}
              description={t("noResultsDesc")}
            />
          ) : (
            filteredArticles.map((article) => {
              const title =
                locale === "fr" ? article.title_fr : article.title;
              const content =
                locale === "fr" ? article.content_fr : article.content;
              const isExpanded = expandedArticle === article.id;

              return (
                <Card key={article.id}>
                  <button
                    className="w-full text-left"
                    onClick={() =>
                      setExpandedArticle(isExpanded ? null : article.id)
                    }
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base font-semibold leading-snug">
                            {title}
                          </CardTitle>
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {t(article.category as Category)}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                      </div>
                    </CardHeader>
                  </button>

                  {isExpanded && (
                    <CardContent className="pt-0 space-y-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                        {content}
                      </div>

                      {/* Feedback */}
                      <div className="border-t pt-4">
                        {feedbackGiven[article.id] ? (
                          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                            {t("thanksFeedback")}
                          </p>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              {t("wasHelpful")}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFeedback(article.id, true);
                              }}
                            >
                              <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                              {t("yes")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFeedback(article.id, false);
                              }}
                            >
                              <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                              {t("no")}
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Contact link */}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {t("stillNeedHelp")}
                        </span>
                        <Link
                          href="/contact"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {t("contactUs")}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
