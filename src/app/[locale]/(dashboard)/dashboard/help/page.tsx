"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Shield,
  Wallet,
  PiggyBank,
  HeartHandshake,
  ClipboardCheck,
  Home,
  UserPlus,
  Landmark,
  AlertTriangle,
  Building2,
  Loader2,
  CheckCircle2,
  Send,
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { Link } from "@/i18n/routing";
import { useGroup } from "@/lib/group-context";

// ─── Article types & constants ───────────────────────────────────────────────

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

// ─── FAQ types ───────────────────────────────────────────────────────────────

interface FAQ {
  id: string;
  question: string;
  question_fr: string;
  answer: string;
  answer_fr: string;
  category: string | null;
  sort_order: number;
  is_published: boolean;
}

// ─── Guide definitions ──────────────────────────────────────────────────────

const GUIDES = [
  { key: "guide1", icon: Shield },
  { key: "guide2", icon: Wallet },
  { key: "guide3", icon: PiggyBank },
  { key: "guide4", icon: HeartHandshake },
  { key: "guide5", icon: ClipboardCheck },
  { key: "guide6", icon: Home },
  { key: "guide7", icon: UserPlus },
  { key: "guide8", icon: Landmark },
  { key: "guide9", icon: AlertTriangle },
  { key: "guide10", icon: Building2 },
] as const;

// ─── Data hooks ──────────────────────────────────────────────────────────────

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

function useFAQs() {
  return useQuery({
    queryKey: ["faqs"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("faqs")
        .select("*")
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      return data as FAQ[];
    },
  });
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function HelpPage() {
  const t = useTranslations("help");
  const locale = useLocale();
  const { user } = useGroup();

  const {
    data: articles,
    isLoading: articlesLoading,
    isError: articlesError,
    error: articlesErr,
    refetch: refetchArticles,
  } = useHelpArticles();

  const {
    data: faqs,
    isLoading: faqsLoading,
    isError: faqsError,
  } = useFAQs();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean>>(
    {}
  );
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);

  // Contact form state
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactType, setContactType] = useState<string>("question");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState("");

  // ─── Filtered articles ─────────────────────────────────────────────────

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

  // ─── Filtered FAQs ────────────────────────────────────────────────────

  const filteredFAQs = useMemo(() => {
    if (!faqs) return [];
    if (!searchQuery) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter((faq) => {
      const question =
        locale === "fr" ? faq.question_fr : faq.question;
      const answer = locale === "fr" ? faq.answer_fr : faq.answer;
      return (
        question.toLowerCase().includes(q) ||
        answer.toLowerCase().includes(q)
      );
    });
  }, [faqs, searchQuery, locale]);

  // Group FAQs by category
  const faqsByCategory = useMemo(() => {
    const grouped: Record<string, FAQ[]> = {};
    for (const faq of filteredFAQs) {
      const cat = faq.category || "general";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(faq);
    }
    return grouped;
  }, [filteredFAQs]);

  // ─── Handlers ─────────────────────────────────────────────────────────

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

  const handleContactSubmit = async () => {
    if (!contactSubject.trim() || !contactMessage.trim()) return;
    setContactSubmitting(true);
    setContactError("");
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      const { error } = await supabase.from("contact_enquiries").insert({
        user_id: authUser.id,
        email: authUser.email,
        name: user?.full_name || user?.display_name || authUser.email || "",
        subject: contactSubject.trim(),
        message: contactMessage.trim(),
        status: "new",
      });
      if (error) throw error;
      setContactSuccess(true);
      setContactSubject("");
      setContactMessage("");
      setContactType("question");
    } catch (err) {
      setContactError((err as Error).message || t("contactError"));
    } finally {
      setContactSubmitting(false);
    }
  };

  // ─── Loading / Error for articles tab ─────────────────────────────────

  const renderArticlesTab = () => {
    if (articlesLoading) return <ListSkeleton rows={6} />;
    if (articlesError)
      return (
        <ErrorState
          message={(articlesErr as Error)?.message}
          onRetry={() => refetchArticles()}
        />
      );

    return (
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

        {/* Articles list */}
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
    );
  };

  // ─── FAQ Tab ──────────────────────────────────────────────────────────

  const renderFAQTab = () => {
    if (faqsLoading) return <ListSkeleton rows={6} />;
    if (faqsError)
      return (
        <EmptyState
          icon={HelpCircle}
          title={t("faqEmpty")}
          description={t("faqEmptyDesc")}
        />
      );

    const categoryKeys = Object.keys(faqsByCategory);

    if (categoryKeys.length === 0) {
      return (
        <EmptyState
          icon={HelpCircle}
          title={t("faqEmpty")}
          description={t("faqEmptyDesc")}
        />
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t("faqTitle")}</h2>
        </div>

        {categoryKeys.map((category) => (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {category}
            </h3>
            <Card>
              <CardContent className="p-4">
                <Accordion>
                  {faqsByCategory[category].map((faq) => {
                    const question =
                      locale === "fr" ? faq.question_fr : faq.question;
                    const answer =
                      locale === "fr" ? faq.answer_fr : faq.answer;
                    return (
                      <AccordionItem key={faq.id} value={faq.id}>
                        <AccordionTrigger className="text-left text-sm font-medium">
                          {question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {answer}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    );
  };

  // ─── Guides Tab ───────────────────────────────────────────────────────

  const renderGuidesTab = () => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t("guidesTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("guidesSubtitle")}
          </p>
        </div>

        <Accordion>
          {GUIDES.map(({ key, icon: Icon }) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t(`${key}Title`)}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {t(`${key}Desc`)}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed pl-11 whitespace-pre-wrap">
                {t(`${key}Content`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  };

  // ─── Contact Tab ──────────────────────────────────────────────────────

  const renderContactTab = () => {
    if (contactSuccess) {
      return (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-semibold">{t("contactSuccess")}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t("contactSuccessDesc")}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setContactSuccess(false)}
            >
              {t("contactAnother")}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t("contactTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("contactSubtitle")}
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="contact-type">{t("contactType")}</Label>
              <Select
                value={contactType}
                onValueChange={(val) => val && setContactType(val)}
              >
                <SelectTrigger className="w-full" id="contact-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t("typeBug")}</SelectItem>
                  <SelectItem value="feature_request">
                    {t("typeFeature")}
                  </SelectItem>
                  <SelectItem value="question">
                    {t("typeQuestion")}
                  </SelectItem>
                  <SelectItem value="other">{t("typeOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="contact-subject">{t("contactSubject")}</Label>
              <Input
                id="contact-subject"
                value={contactSubject}
                onChange={(e) => setContactSubject(e.target.value)}
                disabled={contactSubmitting}
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="contact-message">{t("contactMessage")}</Label>
              <Textarea
                id="contact-message"
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                rows={5}
                disabled={contactSubmitting}
              />
            </div>

            {/* Error */}
            {contactError && (
              <p className="text-sm text-red-600 dark:text-red-400">{contactError}</p>
            )}

            {/* Submit */}
            <Button
              onClick={handleContactSubmit}
              disabled={
                contactSubmitting ||
                !contactSubject.trim() ||
                !contactMessage.trim()
              }
              className="w-full sm:w-auto"
            >
              {contactSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {t("contactSubmit")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* Search — filters both Articles and FAQs */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="articles">
        <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1 dark:bg-muted/40">
          <TabsTrigger
            value="articles"
            className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground"
          >
            <BookOpen className="h-4 w-4 mr-1.5 hidden sm:inline" />
            {t("tabArticles")}
          </TabsTrigger>
          <TabsTrigger
            value="faq"
            className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground"
          >
            <HelpCircle className="h-4 w-4 mr-1.5 hidden sm:inline" />
            {t("tabFaq")}
          </TabsTrigger>
          <TabsTrigger
            value="guides"
            className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground"
          >
            <MessageSquare className="h-4 w-4 mr-1.5 hidden sm:inline" />
            {t("tabGuides")}
          </TabsTrigger>
          <TabsTrigger
            value="contact"
            className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground"
          >
            <Send className="h-4 w-4 mr-1.5 hidden sm:inline" />
            {t("tabContact")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="articles" className="mt-6">
          {renderArticlesTab()}
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          {renderFAQTab()}
        </TabsContent>

        <TabsContent value="guides" className="mt-6">
          {renderGuidesTab()}
        </TabsContent>

        <TabsContent value="contact" className="mt-6">
          {renderContactTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
