import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Heart,
  Users,
  Eye,
  Smartphone,
  ArrowRight,
} from "lucide-react";

const countries = [
  { code: "CM", flag: "\ud83c\udde8\ud83c\uddf2" },
  { code: "NG", flag: "\ud83c\uddf3\ud83c\uddec" },
  { code: "GH", flag: "\ud83c\uddec\ud83c\udded" },
  { code: "KE", flag: "\ud83c\uddf0\ud83c\uddea" },
  { code: "ZA", flag: "\ud83c\uddff\ud83c\udde6" },
  { code: "UG", flag: "\ud83c\uddfa\ud83c\uddec" },
  { code: "SN", flag: "\ud83c\uddf8\ud83c\uddf3" },
  { code: "TZ", flag: "\ud83c\uddf9\ud83c\uddff" },
  { code: "USA", flag: "\ud83c\uddfa\ud83c\uddf8" },
  { code: "UK", flag: "\ud83c\uddec\ud83c\udde7" },
  { code: "CA", flag: "\ud83c\udde8\ud83c\udde6" },
];

export default function AboutPage() {
  const t = useTranslations("about");
  const tLanding = useTranslations("landing");
  const tCommon = useTranslations("common");
  const tCountries = useTranslations("countries");

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      {/* Hero */}
      <section className="px-4 pb-12 pt-24 text-center sm:pt-32">
        <h1 className="mx-auto max-w-3xl text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {t("story")}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          {t("storyDesc")}
        </p>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="flex items-start gap-4">
          <div className="h-full w-1 shrink-0 rounded-full bg-emerald-600" />
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Heart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                {t("mission")}
              </h2>
            </div>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {t("missionDesc")}
            </p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-muted/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl font-bold text-foreground">
            {t("problemTitle")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {t("problemDesc")}
          </p>
        </div>
      </section>

      {/* Solution */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h2 className="text-2xl font-bold text-foreground">
          {t("solutionTitle")}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {t("solutionDesc")}
        </p>
        <div className="mt-6 h-1 w-16 rounded-full bg-emerald-600" />
      </section>

      {/* Values */}
      <section className="bg-muted/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold text-foreground">
            {t("valuesTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">
                  {t("valueTransparency")}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("valueTransparencyDesc")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">
                  {t("valueCommunity")}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("valueCommunityDesc")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Globe className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">
                  {t("valueAfrica")}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("valueAfricaDesc")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Smartphone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">
                  {t("valueSimple")}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("valueSimpleDesc")}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{t("team")}</h2>
        </div>
        <p className="mt-2 text-muted-foreground">{t("teamDesc")}</p>

        <Card className="mt-8 max-w-xs">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white shadow-md">
              JA
            </div>
            <div>
              <p className="font-semibold text-foreground">Jude Anyere</p>
              <p className="text-sm text-muted-foreground">{t("judeRole")}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Pan-African / Country Flags */}
      <section className="bg-muted/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Globe className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              {t("panAfrican")}
            </h2>
          </div>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {t("panAfricanDesc")}
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {countries.map((country) => (
              <Badge
                key={country.code}
                variant="secondary"
                className="gap-1.5 px-3 py-1.5 text-sm"
              >
                <span className="text-2xl">{country.flag}</span>
                <span className="text-muted-foreground">{tCountries(country.code)}</span>
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              500+
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("statsGroups")}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              10,000+
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("statsMembers")}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              $2M+
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("statsManaged")}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              11
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("statsCountries")}</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-emerald-600 py-12 text-center dark:bg-emerald-700 sm:py-16">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {t("ctaTitle")}
          </h2>
          <p className="mt-3 text-emerald-100">{t("ctaSubtitle")}</p>
          <Link href="/signup">
            <Button
              size="lg"
              className="mt-6 bg-white text-emerald-700 hover:bg-emerald-50 dark:bg-white dark:text-emerald-700 dark:hover:bg-emerald-50"
            >
              {tCommon("getStarted")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} VillageClaq</p>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-foreground">
              {tLanding("footerAbout")}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {tLanding("footerTerms")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {tLanding("footerPrivacy")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
