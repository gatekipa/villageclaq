import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
  Users,
  HandCoins,
  FileText,
  MessageSquare,
  BarChart3,
  Languages,
  Check,
  ArrowRight,
  Star,
  RefreshCw,
  Vote,
  FolderLock,
  CreditCard,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  { key: "Membership", icon: Users },
  { key: "Contributions", icon: HandCoins },
  { key: "Meetings", icon: FileText },
  { key: "Comms", icon: MessageSquare },
  { key: "Finance", icon: BarChart3 },
  { key: "Bilingual", icon: Languages },
] as const;

const phase9Features = [
  { titleKey: "savingsFeatureTitle", descKey: "savingsFeatureDesc", icon: RefreshCw },
  { titleKey: "electionsFeatureTitle", descKey: "electionsFeatureDesc", icon: Vote },
  { titleKey: "documentFeatureTitle", descKey: "documentFeatureDesc", icon: FolderLock },
  { titleKey: "memberCardFeatureTitle", descKey: "memberCardFeatureDesc", icon: CreditCard },
] as const;

const countries = [
  { name: "Cameroon", flag: "🇨🇲" },
  { name: "Nigeria", flag: "🇳🇬" },
  { name: "Ghana", flag: "🇬🇭" },
  { name: "Kenya", flag: "🇰🇪" },
  { name: "South Africa", flag: "🇿🇦" },
  { name: "Uganda", flag: "🇺🇬" },
  { name: "Senegal", flag: "🇸🇳" },
  { name: "USA", flag: "🇺🇸" },
  { name: "UK", flag: "🇬🇧" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "France", flag: "🇫🇷" },
];

const testimonials = [
  { name: "Cyril N.", location: "Cameroon", group: "Bamenda Alumni Union", initials: "CN" },
  { name: "Adebayo O.", location: "Nigeria", group: "Lagos Ajo Cooperative", initials: "AO" },
  { name: "Kwame A.", location: "Ghana", group: "Accra Susu Collective", initials: "KA" },
  { name: "Wanjiku M.", location: "Kenya", group: "Nairobi Chama Network", initials: "WM" },
  { name: "Thabo D.", location: "South Africa", group: "Soweto Stokvel", initials: "TD" },
];

export default function HomePage() {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground text-sm">
              VC
            </div>
            <span className="text-xl font-bold">{t("common.appName")}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">{t("auth.login")}</Button>
            </Link>
            <Link href="/signup">
              <Button>{t("common.getStarted")}</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-6">
              <Globe className="mr-1 h-3 w-3" />
              {t("landing.trustedBy")}
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              {t("landing.heroTitle")}
              <br />
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                {t("landing.heroTitleAccent")}
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/signup">
                <Button size="lg" className="w-full sm:w-auto text-base px-8 py-6">
                  {t("common.startFree")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8 py-6">
                  {t("auth.login")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="border-t bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.featuresTitle")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("landing.featuresSubtitle")}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="group relative rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{t(`landing.feature${key}`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.feature${key}Desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Phase 9 Features - Pan-African */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">
              <Star className="mr-1 h-3 w-3" />
              {t("landing.builtForYou")}
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.builtForYou")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("landing.builtForYouDesc")}
            </p>
          </div>

          {/* Country flags row */}
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-3">
            {countries.map((country) => (
              <div
                key={country.name}
                className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm"
              >
                <span className="text-lg">{country.flag}</span>
                <span className="text-muted-foreground">{country.name}</span>
              </div>
            ))}
          </div>

          {/* Phase 9 feature cards */}
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
            {phase9Features.map(({ titleKey, descKey, icon: Icon }) => (
              <div
                key={titleKey}
                className="group relative rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{t(`landing.${titleKey}`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.${descKey}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.trustedBy")}
            </h2>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.slice(0, 3).map((person) => (
              <div key={person.name} className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {person.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.group}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-3 text-sm text-muted-foreground italic">
                  &ldquo;VillageClaq transformed how our {person.location} group manages finances and meetings. Everything is transparent now.&rdquo;
                </p>
                <Badge variant="outline" className="mt-3 text-xs">
                  {person.location}
                </Badge>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-6 grid max-w-3xl gap-6 sm:grid-cols-2">
            {testimonials.slice(3).map((person) => (
              <div key={person.name} className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {person.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.group}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-3 text-sm text-muted-foreground italic">
                  &ldquo;Finally a platform that understands how our community savings work. The rotating savings tracker is exactly what we needed.&rdquo;
                </p>
                <Badge variant="outline" className="mt-3 text-xs">
                  {person.location}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.pricingTitle")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("landing.pricingSubtitle")}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3">
            {/* Free */}
            <div className="relative rounded-2xl border bg-card p-8 shadow-sm">
              <h3 className="text-lg font-semibold">{t("landing.pricingFree")}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("landing.pricingFreePrice")}</span>
                <span className="text-sm text-muted-foreground">{t("landing.pricingFreePeriod")}</span>
              </div>
              <ul className="mt-8 space-y-3">
                {(["1", "2", "3", "4"] as const).map((n) => (
                  <li key={n} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {t(`landing.pricingFreeFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 block">
                <Button variant="outline" className="w-full">{t("common.getStarted")}</Button>
              </Link>
            </div>

            {/* Pro */}
            <div className="relative rounded-2xl border-2 border-primary bg-card p-8 shadow-lg">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                {t("landing.pricingProBadge")}
              </Badge>
              <h3 className="text-lg font-semibold">{t("landing.pricingPro")}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("landing.pricingProPrice")}</span>
                <span className="text-sm text-muted-foreground">{t("landing.pricingProPeriod")}</span>
              </div>
              <ul className="mt-8 space-y-3">
                {(["1", "2", "3", "4", "5"] as const).map((n) => (
                  <li key={n} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {t(`landing.pricingProFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 block">
                <Button className="w-full">{t("common.getStarted")}</Button>
              </Link>
            </div>

            {/* Org */}
            <div className="relative rounded-2xl border bg-card p-8 shadow-sm">
              <h3 className="text-lg font-semibold">{t("landing.pricingOrg")}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("landing.pricingOrgPrice")}</span>
                <span className="text-sm text-muted-foreground">{t("landing.pricingOrgPeriod")}</span>
              </div>
              <ul className="mt-8 space-y-3">
                {(["1", "2", "3", "4", "5"] as const).map((n) => (
                  <li key={n} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {t(`landing.pricingOrgFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 block">
                <Button variant="outline" className="w-full">{t("common.contactUs")}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary/5 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("landing.ctaTitle")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("landing.ctaSubtitle")}
          </p>
          <div className="mt-10">
            <Link href="/signup">
              <Button size="lg" className="text-base px-10 py-6">
                {t("common.startFree")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-xs">
                  VC
                </div>
                <span className="text-lg font-bold">{t("common.appName")}</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("landing.footerTagline")}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold">{t("landing.footerProduct")}</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>{t("landing.featuresTitle")}</li>
                <li>{t("landing.pricingTitle")}</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold">{t("landing.footerCompany")}</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>{t("landing.footerAbout")}</li>
                <li>{t("landing.footerBlog")}</li>
                <li>{t("landing.footerCareers")}</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold">{t("landing.footerLegal")}</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>{t("landing.footerPrivacy")}</li>
                <li>{t("landing.footerTerms")}</li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
            &copy; 2026 {t("common.appName")}. {t("landing.footerRights")}
          </div>
        </div>
      </footer>
    </div>
  );
}
