"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  Users,
  ClipboardCheck,
  Briefcase,
  FileText,
  TrendingUp,
  Calendar,
  BarChart3,
  PieChart,
  Shield,
  Heart,
  Award,
  GitBranch,
  Vote,
  Scale,
  BookOpen,
  Search,
  Sparkles,
  ArrowRight,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useDashboardStats } from "@/lib/hooks/use-supabase-query";
import { usePermissions } from "@/lib/hooks/use-permissions";

type ReportCategory = "financial" | "membership" | "operations" | "executive";

interface ReportDef {
  id: string;
  key: string;
  icon: typeof DollarSign;
  category: ReportCategory;
  isPlaceholder?: boolean;
  linkOverride?: string;
}

const reports: ReportDef[] = [
  // Financial
  { id: "1", key: "report1", icon: DollarSign, category: "financial" },
  { id: "2", key: "report2", icon: BarChart3, category: "financial" },
  { id: "3", key: "report3", icon: FileText, category: "financial" },
  { id: "4", key: "report4", icon: TrendingUp, category: "financial" },
  { id: "5", key: "report5", icon: PieChart, category: "financial" },
  // Membership
  { id: "6", key: "report6", icon: Shield, category: "membership" },
  { id: "7", key: "report7", icon: BarChart3, category: "membership" },
  { id: "8", key: "report8", icon: Users, category: "membership" },
  { id: "9", key: "report9", icon: TrendingUp, category: "membership" },
  { id: "10", key: "report10", icon: Award, category: "membership" },
  // Operations
  { id: "11", key: "report11", icon: ClipboardCheck, category: "operations" },
  { id: "12", key: "report12", icon: Calendar, category: "operations" },
  { id: "13", key: "report13", icon: Shield, category: "operations" },
  { id: "14", key: "report14", icon: BookOpen, category: "operations" },
  { id: "15", key: "report15", icon: Heart, category: "operations" },
  // Executive
  { id: "16", key: "report16", icon: Briefcase, category: "executive" },
  { id: "17", key: "report17", icon: GitBranch, category: "executive", isPlaceholder: true },
  { id: "18", key: "report18", icon: Vote, category: "executive" },
  { id: "19", key: "report19", icon: Scale, category: "executive" },
  { id: "20", key: "report20", icon: FileText, category: "executive" },
];

const categoryColors: Record<ReportCategory, string> = {
  financial: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  membership: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  operations: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  executive: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const categoryIconColors: Record<ReportCategory, string> = {
  financial: "text-emerald-600 dark:text-emerald-400",
  membership: "text-blue-600 dark:text-blue-400",
  operations: "text-purple-600 dark:text-purple-400",
  executive: "text-amber-600 dark:text-amber-400",
};

export default function ReportsHubPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { hasPermission } = usePermissions();
  const canViewReports = hasPermission("reports.view");
  const canExport = hasPermission("reports.export");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<ReportCategory | "all">("all");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { data: stats } = useDashboardStats();

  const [aiHidden, setAiHidden] = useState(false);

  const fetchAiInsights = useCallback(async () => {
    if (!stats || aiHidden) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "dashboard-overview",
          reportData: {
            memberCount: stats.totalMembers,
            totalCollected: stats.totalCollected,
            collectionRate: stats.collectionRate,
            outstandingBalance: stats.outstanding,
            upcomingEvents: stats.upcomingEvents,
          },
          locale,
        }),
      });
      if (res.status === 503 || res.status === 429) {
        setAiHidden(true);
        return;
      }
      const data = await res.json();
      if (!res.ok || data.error === "unavailable") {
        setAiHidden(true);
        return;
      }
      setAiInsight(data.insights || null);
    } catch {
      setAiHidden(true);
    } finally {
      setAiLoading(false);
    }
  }, [stats, locale, aiHidden]);

  useEffect(() => {
    if (stats && !aiInsight && !aiLoading && !aiHidden) {
      fetchAiInsights();
    }
  }, [stats, aiInsight, aiLoading, aiHidden, fetchAiInsights]);

  const categories: ReportCategory[] = ["financial", "membership", "operations", "executive"];

  const filtered = reports.filter((r) => {
    if (activeCategory !== "all" && r.category !== activeCategory) return false;
    if (search) {
      const name = t(`reports.${r.key}.name`).toLowerCase();
      const desc = t(`reports.${r.key}.desc`).toLowerCase();
      return name.includes(search.toLowerCase()) || desc.includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("reports.title")}</h1>
          <p className="text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
        {canExport && (
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer className="mr-1 h-3.5 w-3.5" />{t("reports.print")}
          </Button>
        )}
      </div>

      {/* AI Insights Card — hidden when AI is unavailable */}
      {!aiHidden && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{t("reports.aiInsights")}</h3>
                {!aiLoading && aiInsight && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchAiInsights}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {aiLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <p className="text-xs text-muted-foreground mt-1">{t("reports.aiLoading")}</p>
                </div>
              ) : aiInsight ? (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{aiInsight}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("reports.aiDesc")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Category Filter */}
      <div className="flex flex-col gap-3 sm:flex-row print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <Button variant={activeCategory === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveCategory("all")}>
            {t("common.all")}
          </Button>
          {categories.map((cat) => (
            <Button key={cat} variant={activeCategory === cat ? "default" : "outline"} size="sm" onClick={() => setActiveCategory(cat)} className="whitespace-nowrap">
              {t(`reports.categories.${cat}`)}
            </Button>
          ))}
        </div>
      </div>

      {/* Reports by Category */}
      {categories
        .filter((cat) => activeCategory === "all" || activeCategory === cat)
        .map((category) => {
          const categoryReports = filtered.filter((r) => r.category === category);
          if (categoryReports.length === 0) return null;
          return (
            <div key={category}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Badge className={categoryColors[category]}>{t(`reports.categories.${category}`)}</Badge>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categoryReports.map((report) => {
                  const ReportIcon = report.icon;
                  const href = report.linkOverride || `/dashboard/reports/${report.id}`;
                  return (
                    <Card key={report.id} className="group transition-shadow hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ${categoryIconColors[report.category]}`}>
                            <ReportIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{t(`reports.${report.key}.name`)}</h3>
                              {report.isPlaceholder && (
                                <Badge variant="secondary" className="text-[10px]">{t("reports.placeholder")}</Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {t(`reports.${report.key}.desc`)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Link href={href}>
                            <Button size="sm" variant={report.isPlaceholder ? "outline" : "default"} disabled={report.isPlaceholder || !canViewReports} className="h-7 text-xs">
                              {t("reports.generate")}
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}
