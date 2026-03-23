"use client";

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
  Shield,
  TrendingUp,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PublicNavbar } from "@/components/layout/public-navbar";

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
  {
    name: "Cyril N.",
    location: "Cameroon",
    group: "Bamenda Alumni Union",
    initials: "CN",
    quote: "VillageClaq transformed how our group manages finances. Every contribution is tracked, every meeting documented. Total transparency.",
  },
  {
    name: "Adebayo O.",
    location: "Nigeria",
    group: "Lagos Ajo Cooperative",
    initials: "AO",
    quote: "We moved from WhatsApp chaos to organized management overnight. Our members love the contribution tracking and automated reminders.",
  },
  {
    name: "Kwame A.",
    location: "Ghana",
    group: "Accra Susu Collective",
    initials: "KA",
    quote: "The rotating savings tracker is exactly what we needed. No more spreadsheets, no more arguments about who paid what.",
  },
  {
    name: "Wanjiku M.",
    location: "Kenya",
    group: "Nairobi Chama Network",
    initials: "WM",
    quote: "Managing 200+ members across three chamas used to be a nightmare. Now it takes minutes. The reports alone are worth it.",
  },
  {
    name: "Thabo D.",
    location: "South Africa",
    group: "Soweto Stokvel",
    initials: "TD",
    quote: "Our stokvel finally has a proper system. Members check their balances anytime, and our treasurer sleeps better at night.",
  },
];

const steps = [
  { num: "1", titleKey: "step1Title", descKey: "step1Desc", icon: Users },
  { num: "2", titleKey: "step2Title", descKey: "step2Desc", icon: Shield },
  { num: "3", titleKey: "step3Title", descKey: "step3Desc", icon: TrendingUp },
] as const;

export default function HomePage() {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ── */}
      <PublicNavbar heroOverlay />

      {/* ── Hero ── */}
      <section className="relative -mt-16 overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 dark:from-emerald-950 dark:via-gray-950 dark:to-teal-950 pt-16">
        {/* Floating decorative shapes */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute right-10 top-10 h-48 w-48 rounded-full bg-teal-400/15 blur-2xl" />
          <div className="absolute bottom-20 left-1/4 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="absolute -bottom-10 right-1/3 h-40 w-40 rounded-full bg-teal-300/10 blur-2xl" />
          <div className="absolute left-1/2 top-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-white/5 blur-xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-0 pt-20 sm:px-6 sm:pt-28 lg:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-8 border-emerald-400/30 bg-white/10 text-white backdrop-blur-sm">
              <Globe className="mr-1.5 h-3.5 w-3.5" />
              {t("landing.trustedBy")}
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-7xl">
              {t("landing.heroTitle")}
              <br />
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                {t("landing.heroTitleAccent")}
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-emerald-100/80 sm:text-xl">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="w-full bg-white text-emerald-900 shadow-xl shadow-black/20 hover:bg-emerald-50 sm:w-auto text-base px-8 py-6 font-semibold"
                >
                  {t("common.startFree")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full border-white/20 bg-white/5 text-white backdrop-blur-sm hover:bg-white/10 sm:w-auto text-base px-8 py-6"
                >
                  {t("auth.login")}
                </Button>
              </Link>
            </div>
          </div>

          {/* Mock Dashboard Preview */}
          <div className="mx-auto mt-16 max-w-4xl sm:mt-20">
            <div className="rounded-t-2xl border border-b-0 border-white/10 bg-white/5 p-2 pb-0 shadow-2xl shadow-black/40 backdrop-blur-md">
              <div className="rounded-t-xl bg-gray-950/80 overflow-hidden">
                {/* Title bar */}
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-400/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                    <div className="h-3 w-3 rounded-full bg-green-400/80" />
                  </div>
                  <div className="ml-4 flex-1 rounded-md bg-white/5 px-3 py-1 text-xs text-white/40">
                    app.villageclaq.com/dashboard
                  </div>
                </div>
                <div className="flex">
                  {/* Sidebar mock */}
                  <div className="hidden w-48 shrink-0 border-r border-white/5 p-4 sm:block">
                    <div className="mb-6 flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/30 flex items-center justify-center text-xs text-emerald-300 font-bold">VC</div>
                      <div className="h-3 w-20 rounded bg-white/10" />
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs text-emerald-300 font-medium">Dashboard</div>
                      <div className="rounded-lg px-3 py-2 text-xs text-white/30">Members</div>
                      <div className="rounded-lg px-3 py-2 text-xs text-white/30">Contributions</div>
                      <div className="rounded-lg px-3 py-2 text-xs text-white/30">Meetings</div>
                      <div className="rounded-lg px-3 py-2 text-xs text-white/30">Reports</div>
                    </div>
                  </div>
                  {/* Main content mock */}
                  <div className="flex-1 p-4 sm:p-6">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "Members", value: "247", change: "+12%" },
                        { label: "Balance", value: "$18.4K", change: "+8%" },
                        { label: "Collected", value: "94%", change: "On track" },
                        { label: "Meetings", value: "12", change: "This year" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg border border-white/5 bg-white/5 p-3">
                          <div className="text-[10px] text-white/40 uppercase tracking-wider">{s.label}</div>
                          <div className="mt-1 text-lg font-bold text-white">{s.value}</div>
                          <div className="mt-0.5 text-[10px] text-emerald-400">{s.change}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-lg border border-white/5 bg-white/5 overflow-hidden">
                      <div className="border-b border-white/5 px-4 py-2.5 text-xs font-medium text-white/60">Recent Contributions</div>
                      <div className="divide-y divide-white/5">
                        {[
                          { name: "Aisha M.", amount: "$50", status: "Paid" },
                          { name: "Emeka O.", amount: "$50", status: "Paid" },
                          { name: "Fatou D.", amount: "$50", status: "Pending" },
                        ].map((row) => (
                          <div key={row.name} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-full bg-white/10" />
                              <span className="text-xs text-white/60">{row.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-white/80 font-medium">{row.amount}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.status === "Paid" ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                                {row.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Smooth gradient fade to stats section */}
        <div className="h-24 bg-gradient-to-b from-transparent to-emerald-50 dark:to-emerald-950/50" />
      </section>

      {/* ── Stats Bar ── */}
      <section className="relative bg-emerald-50 dark:bg-emerald-950/50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {[
              { value: "500+", label: t("landing.statsGroups"), icon: Users },
              { value: "10,000+", label: t("landing.statsMembers"), icon: Globe },
              { value: "$2M+", label: t("landing.statsTracked"), icon: TrendingUp },
              { value: "11", label: t("landing.statsCountries"), icon: Globe },
            ].map((stat) => (
              <div key={stat.label} className="group text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:group-hover:bg-emerald-500 dark:group-hover:text-white">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="text-3xl font-extrabold tracking-tight sm:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm font-medium text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Fade out from stats to features */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-background" />
      </section>

      {/* ── Core Features ── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("landing.featuresTitle")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
              {t("landing.featuresSubtitle")}
            </p>
          </div>
          <div className="mx-auto mt-20 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/20">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold">{t(`landing.feature${key}`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.feature${key}Desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("landing.howItWorks")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
              {t("landing.howItWorksSubtitle")}
            </p>
          </div>
          <div className="mx-auto mt-20 max-w-4xl">
            <div className="relative grid gap-12 sm:grid-cols-3 sm:gap-8">
              {/* Connecting line */}
              <div className="absolute left-0 right-0 top-10 hidden h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent sm:block" />
              {steps.map(({ num, titleKey, descKey }) => (
                <div key={num} className="relative text-center">
                  <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-primary/10" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                      {num}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold">{t(`landing.${titleKey}`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {t(`landing.${descKey}`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Built For Your Community (Pan-African) ── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-6 text-sm px-4 py-1.5">
              <Star className="mr-1.5 h-3.5 w-3.5" />
              {t("landing.builtForYou")}
            </Badge>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("landing.builtForYou")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
              {t("landing.builtForYouDesc")}
            </p>
          </div>

          {/* Country flag pills */}
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
            {countries.map((country) => (
              <div
                key={country.name}
                className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <span className="text-lg">{country.flag}</span>
                <span className="font-medium text-muted-foreground">{country.name}</span>
              </div>
            ))}
          </div>

          {/* Phase 9 feature cards */}
          <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2">
            {phase9Features.map(({ titleKey, descKey, icon: Icon }) => (
              <div
                key={titleKey}
                className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/20">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold">{t(`landing.${titleKey}`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.${descKey}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("landing.trustedBy")}
            </h2>
          </div>

          {/* Top row: 3 cards */}
          <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.slice(0, 3).map((person) => (
              <div
                key={person.name}
                className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="mt-5 text-base leading-relaxed text-muted-foreground italic">
                    &ldquo;{person.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-4 border-t pt-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-bold text-primary">
                      {person.initials}
                    </div>
                    <div>
                      <p className="font-semibold">{person.name}</p>
                      <p className="text-sm text-muted-foreground">{person.group}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {person.location}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom row: 2 cards */}
          <div className="mx-auto mt-6 grid max-w-4xl gap-6 sm:grid-cols-2">
            {testimonials.slice(3).map((person) => (
              <div
                key={person.name}
                className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="mt-5 text-base leading-relaxed text-muted-foreground italic">
                    &ldquo;{person.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-4 border-t pt-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-bold text-primary">
                      {person.initials}
                    </div>
                    <div>
                      <p className="font-semibold">{person.name}</p>
                      <p className="text-sm text-muted-foreground">{person.group}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {person.location}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("landing.pricingTitle")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
              {t("landing.pricingSubtitle")}
            </p>
          </div>
          <div className="mx-auto mt-20 grid max-w-6xl items-center gap-8 lg:grid-cols-3">
            {/* Free */}
            <div className="relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-lg sm:p-10">
              <h3 className="text-xl font-bold">{t("landing.pricingFree")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight">{t("landing.pricingFreePrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("landing.pricingFreePeriod")}</span>
              </div>
              <ul className="mt-8 space-y-4">
                {(["1", "2", "3", "4"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`landing.pricingFreeFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-10 block">
                <Button variant="outline" size="lg" className="w-full text-base font-semibold">
                  {t("common.getStarted")}
                </Button>
              </Link>
            </div>

            {/* Pro (elevated) */}
            <div className="relative rounded-2xl border-2 border-primary bg-card p-8 shadow-xl shadow-primary/10 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/15 sm:p-10 lg:scale-105">
              <Badge className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 text-sm shadow-md">
                {t("landing.pricingProBadge")}
              </Badge>
              <h3 className="text-xl font-bold">{t("landing.pricingPro")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight">{t("landing.pricingProPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("landing.pricingProPeriod")}</span>
              </div>
              <ul className="mt-8 space-y-4">
                {(["1", "2", "3", "4", "5"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`landing.pricingProFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-10 block">
                <Button size="lg" className="w-full text-base font-semibold shadow-md shadow-primary/20">
                  {t("common.getStarted")}
                </Button>
              </Link>
            </div>

            {/* Organization */}
            <div className="relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-lg sm:p-10">
              <h3 className="text-xl font-bold">{t("landing.pricingOrg")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight">{t("landing.pricingOrgPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("landing.pricingOrgPeriod")}</span>
              </div>
              <ul className="mt-8 space-y-4">
                {(["1", "2", "3", "4", "5"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`landing.pricingOrgFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-10 block">
                <Button variant="outline" size="lg" className="w-full text-base font-semibold">
                  {t("common.contactUs")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 dark:from-emerald-950 dark:via-gray-950 dark:to-teal-950 py-24 sm:py-32">
        {/* Decorative */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute -right-10 bottom-10 h-48 w-48 rounded-full bg-teal-400/10 blur-2xl" />
          <div className="absolute left-1/2 top-0 h-40 w-96 -translate-x-1/2 rounded-full bg-emerald-300/5 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {t("landing.ctaTitle")}
          </h2>
          <p className="mt-6 text-lg text-emerald-100/80 sm:text-xl">
            {t("landing.ctaSubtitle")}
          </p>
          <p className="mt-3 text-sm text-emerald-200/50">
            {t("landing.trustedBy")}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/signup">
              <Button
                size="lg"
                className="bg-white text-emerald-900 shadow-xl shadow-black/20 hover:bg-emerald-50 text-base px-10 py-6 font-semibold"
              >
                {t("common.startFree")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="lg"
                className="border-white/30 bg-transparent text-white hover:bg-white/10 text-base px-8 py-6 font-medium"
              >
                {t("auth.login")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 font-bold text-white text-sm shadow-md">
                  VC
                </div>
                <span className="text-lg font-bold tracking-tight">{t("common.appName")}</span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {t("landing.footerTagline")}
              </p>
              <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                {t("landing.footerBuiltWith")} <Heart className="inline h-3.5 w-3.5 fill-red-500 text-red-500" />
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                {t("landing.footerProduct")}
              </h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><span className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer">{t("landing.featuresTitle")}</span></li>
                <li><span className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer">{t("landing.pricingTitle")}</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                {t("landing.footerCompany")}
              </h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="/about" className="text-muted-foreground transition-colors hover:text-foreground">{t("landing.footerAbout")}</Link></li>
                <li><Link href="/contact" className="text-muted-foreground transition-colors hover:text-foreground">{t("landing.footerBlog")}</Link></li>
                <li><span className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer">{t("landing.footerCareers")}</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                {t("landing.footerLegal")}
              </h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">{t("landing.footerPrivacy")}</Link></li>
                <li><Link href="/terms" className="text-muted-foreground transition-colors hover:text-foreground">{t("landing.footerTerms")}</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 border-t pt-8 text-center text-sm text-muted-foreground">
            &copy; 2026 {t("common.appName")}. {t("landing.footerRights")}
          </div>
        </div>
      </footer>
    </div>
  );
}
