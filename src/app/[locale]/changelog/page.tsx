import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone, Sparkles, Wrench, Bug, Tag } from "lucide-react";

const categoryConfig: Record<string, { color: string; icon: typeof Sparkles }> = {
  feature: {
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: Sparkles,
  },
  improvement: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: Wrench,
  },
  bugfix: {
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: Bug,
  },
};

interface ChangelogEntry {
  id: string;
  title: string;
  title_fr: string;
  description: string;
  description_fr: string;
  category: string;
  version: string | null;
  published_at: string;
  is_published: boolean;
}

function ChangelogList({ entries, locale }: { entries: ChangelogEntry[]; locale: string }) {
  const t = useTranslations("changelog");

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
          <Megaphone className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{t("noUpdates")}</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {t("noUpdatesDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border sm:left-6" />

      <div className="space-y-8">
        {entries.map((entry) => {
          const config = categoryConfig[entry.category] || categoryConfig.feature;
          const Icon = config.icon;
          const title = locale === "fr" ? (entry.title_fr || entry.title) : entry.title;
          const description = locale === "fr" ? (entry.description_fr || entry.description) : entry.description;
          const date = new Date(entry.published_at).toLocaleDateString(
            locale === "fr" ? "fr-FR" : "en-US",
            { year: "numeric", month: "long", day: "numeric" }
          );

          return (
            <div key={entry.id} className="relative pl-10 sm:pl-14">
              {/* Timeline dot */}
              <div className="absolute left-2.5 top-1 sm:left-4.5">
                <div className="h-3 w-3 rounded-full border-2 border-emerald-500 bg-background" />
              </div>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <time className="text-xs text-muted-foreground font-medium">
                      {date}
                    </time>
                    <Badge variant="secondary" className={`text-xs ${config.color}`}>
                      <Icon className="mr-1 h-3 w-3" />
                      {t(entry.category as "feature" | "improvement" | "bugfix")}
                    </Badge>
                    {entry.version && (
                      <Badge variant="outline" className="text-xs">
                        <Tag className="mr-1 h-3 w-3" />
                        {entry.version}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-semibold sm:text-lg">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChangelogHeader() {
  const t = useTranslations("changelog");

  return (
    <div className="mb-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
        <Megaphone className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}

export default async function ChangelogPage() {
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: changelogs } = await supabase
    .from("changelogs")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  const entries = (changelogs || []) as ChangelogEntry[];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <ChangelogHeader />
        <ChangelogList entries={entries} locale={locale} />
      </main>
    </div>
  );
}
