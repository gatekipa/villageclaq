import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Globe, Heart, Users } from "lucide-react";

const countries = [
  { name: "Cameroon", flag: "\ud83c\udde8\ud83c\uddf2" },
  { name: "Nigeria", flag: "\ud83c\uddf3\ud83c\uddec" },
  { name: "Ghana", flag: "\ud83c\uddec\ud83c\udded" },
  { name: "Kenya", flag: "\ud83c\uddf0\ud83c\uddea" },
  { name: "South Africa", flag: "\ud83c\uddff\ud83c\udde6" },
  { name: "Uganda", flag: "\ud83c\uddfa\ud83c\uddec" },
  { name: "Senegal", flag: "\ud83c\uddf8\ud83c\uddf3" },
  { name: "USA", flag: "\ud83c\uddfa\ud83c\uddf8" },
  { name: "UK", flag: "\ud83c\uddec\ud83c\udde7" },
  { name: "Canada", flag: "\ud83c\udde8\ud83c\udde6" },
  { name: "France", flag: "\ud83c\uddeb\ud83c\uddf7" },
];

export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="flex flex-col items-center px-4 pb-16 pt-20 text-center sm:pt-28">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white shadow-lg">
          VC
        </div>
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {t("story")}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          {t("storyDesc")}
        </p>
      </section>

      <Separator className="mx-auto max-w-3xl" />

      {/* Mission */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Heart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{t("mission")}</h2>
        </div>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {t("missionDesc")}
        </p>
        <div className="mt-6 h-1 w-16 rounded-full bg-emerald-600" />
      </section>

      <Separator className="mx-auto max-w-3xl" />

      {/* Team */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{t("team")}</h2>
        </div>
        <p className="mt-2 text-muted-foreground">{t("teamDesc")}</p>

        {/* Jude Anyere card */}
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

      <Separator className="mx-auto max-w-3xl" />

      {/* Pan-African */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
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

        {/* Country flag badges */}
        <div className="mt-8 flex flex-wrap gap-2">
          {countries.map((country) => (
            <Badge
              key={country.name}
              variant="secondary"
              className="gap-1.5 px-3 py-1.5 text-sm"
            >
              <span className="text-lg">{country.flag}</span>
              <span className="text-muted-foreground">{country.name}</span>
            </Badge>
          ))}
        </div>
      </section>

      {/* Footer spacing */}
      <div className="pb-12" />
    </div>
  );
}
