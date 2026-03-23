import { useTranslations } from "next-intl";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Server,
  Database,
  Shield,
  HardDrive,
  Bell,
  Clock,
  AlertTriangle,
} from "lucide-react";

const services = [
  { key: "api" as const, icon: Server },
  { key: "database" as const, icon: Database },
  { key: "authentication" as const, icon: Shield },
  { key: "storage" as const, icon: HardDrive },
  { key: "notifications" as const, icon: Bell },
];

function StatusHeader() {
  const t = useTranslations("status");

  return (
    <div className="mb-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
        <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}

function OperationalBanner() {
  const t = useTranslations("status");

  return (
    <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20">
      <CardContent className="flex items-center gap-3 p-4 sm:p-6">
        <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div>
          <h2 className="font-semibold text-emerald-900 dark:text-emerald-300">
            {t("allOperational")}
          </h2>
          <p className="text-sm text-emerald-700 dark:text-emerald-400/80">
            {t("uptimeDesc")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceCards() {
  const t = useTranslations("status");

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {services.map(({ key, icon: Icon }) => (
        <Card key={key}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="font-medium text-sm">{t(key)}</span>
            </div>
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {t("operational")}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UptimeCard() {
  const t = useTranslations("status");

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4 sm:p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">{t("uptime")}</h3>
          <p className="text-sm text-muted-foreground">{t("uptimeDesc")}</p>
        </div>
        <div className="ml-auto">
          {/* Uptime bar visualization */}
          <div className="flex gap-0.5">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="h-6 w-1 rounded-full bg-emerald-500 dark:bg-emerald-400"
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IncidentHistory() {
  const t = useTranslations("status");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          {t("incidentHistory")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted mb-3">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{t("noIncidents")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <StatusHeader />

        <div className="space-y-6">
          <OperationalBanner />
          <ServiceCards />
          <UptimeCard />
          <IncidentHistory />
        </div>
      </main>
    </div>
  );
}
