"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Home,
  Calendar,
  MapPin,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  TrendingUp,
  BarChart3,
} from "lucide-react";

type HostingStatus = "completed" | "missed" | "swapped" | "exempted";

interface CoHost {
  name: string;
  initials: string;
}

interface HostingRecord {
  id: string;
  eventTitle: string;
  date: string;
  coHosts: CoHost[];
  location: string;
  status: HostingStatus;
  swappedWith?: string;
  exemptionReason?: string;
}

interface UpcomingAssignment {
  eventTitle: string;
  date: string;
  coHosts: CoHost[];
  location: string;
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const mockUpcoming: UpcomingAssignment = {
  eventTitle: "April General Assembly",
  date: "2026-04-28",
  coHosts: [
    { name: "Jean-Pierre Kamga", initials: "JK" },
    { name: "Sylvie Mbarga", initials: "SM" },
    { name: "Emmanuel Tabi", initials: "ET" },
  ],
  location: "45 Rue de la Joie, Douala",
};

const mockHistory: HostingRecord[] = [
  {
    id: "1",
    eventTitle: "March General Assembly",
    date: "2026-03-15",
    coHosts: [
      { name: "Bernadette Atangana", initials: "BA" },
      { name: "Georges Tchinda", initials: "GT" },
    ],
    location: "78 Boulevard du 20 Mai, Douala",
    status: "completed",
  },
  {
    id: "2",
    eventTitle: "February General Assembly",
    date: "2026-02-22",
    coHosts: [
      { name: "Marie-Claire Fotso", initials: "MF" },
      { name: "Paul Ngoumou", initials: "PN" },
    ],
    location: "Community Hall, Bamenda",
    status: "completed",
  },
  {
    id: "3",
    eventTitle: "January General Assembly",
    date: "2026-01-18",
    coHosts: [{ name: "Rosalie Edimo", initials: "RE" }],
    location: "Town Hall, Bafoussam",
    status: "missed",
  },
  {
    id: "4",
    eventTitle: "December General Assembly",
    date: "2025-12-20",
    coHosts: [{ name: "Hélène Njike", initials: "HN" }],
    location: "12 Avenue Ahmadou Ahidjo, Yaoundé",
    status: "swapped",
    swappedWith: "François Mbassi",
  },
  {
    id: "5",
    eventTitle: "November General Assembly",
    date: "2025-11-28",
    coHosts: [
      { name: "Patrick Biyick", initials: "PB" },
      { name: "Yvonne Tchana", initials: "YT" },
    ],
    location: "Community Center, Douala",
    status: "exempted",
    exemptionReason: "Travel",
  },
];

const statusConfig: Record<
  HostingStatus,
  { color: string; icon: typeof CheckCircle2 }
> = {
  completed: {
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  missed: {
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  swapped: {
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    icon: ArrowRightLeft,
  },
  exempted: {
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: ShieldCheck,
  },
};

export default function MyHostingPage() {
  const t = useTranslations();

  const today = new Date("2026-03-23");
  const assignmentDate = new Date(mockUpcoming.date);
  const daysUntil = Math.ceil(
    (assignmentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timesHostedThisYear = 3;
  const groupAverage = 2.8;
  const hostedPercent = Math.round(
    (timesHostedThisYear / Math.max(timesHostedThisYear, Math.ceil(groupAverage))) * 100
  );
  const avgPercent = Math.round(
    (groupAverage / Math.max(timesHostedThisYear, Math.ceil(groupAverage))) * 100
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("myHosting.title")}
        </h1>
        <p className="text-muted-foreground">{t("myHosting.subtitle")}</p>
      </div>

      {/* Next Assignment Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Home className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">
                {t("myHosting.nextAssignment")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {mockUpcoming.eventTitle}
              </p>

              {/* Co-hosts as avatar badges */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("hosting.coHosts")}:
                </span>
                <div className="flex -space-x-2">
                  {mockUpcoming.coHosts.map((h) => (
                    <Avatar
                      key={h.name}
                      className="h-7 w-7 border-2 border-background"
                    >
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {h.initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {mockUpcoming.coHosts.map((h) => h.name.split(" ")[0]).join(", ")}
                </span>
              </div>

              {/* Date with countdown */}
              <div className="mt-1.5 flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="font-medium">{mockUpcoming.date}</span>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="mr-1 h-3 w-3" />
                  {t("hosting.countdown", { days: daysUntil })}
                </Badge>
              </div>

              {/* Location as Maps link */}
              <a
                href={mapsUrl(mockUpcoming.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <MapPin className="h-4 w-4" />
                {mockUpcoming.location}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <Button variant="outline" className="shrink-0">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {t("hosting.swapHost")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Comparison */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{timesHostedThisYear}</p>
                <p className="text-xs text-muted-foreground">
                  {t("myHosting.timesHostedThisYear")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{groupAverage}</p>
                <p className="text-xs text-muted-foreground">
                  {t("myHosting.groupAverage")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Comparison Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t("myHosting.youVsGroup")}</span>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("myHosting.you")}</span>
                  <span className="font-medium">{timesHostedThisYear}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-primary transition-all"
                    style={{ width: `${hostedPercent}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t("myHosting.groupAverage")}
                  </span>
                  <span className="font-medium">{groupAverage}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${avgPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hosting History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("hosting.hostingHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockHistory.map((record) => {
              const config = statusConfig[record.status];
              const StatusIcon = config.icon;
              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Co-host avatars */}
                    <div className="flex -space-x-2 shrink-0">
                      {record.coHosts.map((h) => (
                        <Avatar
                          key={h.name}
                          className="h-7 w-7 border-2 border-background"
                        >
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                            {h.initials}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {record.eventTitle}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{record.date}</span>
                        <span className="hidden sm:inline">
                          {record.coHosts.map((h) => h.name).join(", ")}
                        </span>
                        {record.swappedWith && (
                          <span>
                            {t("myHosting.swappedWith", {
                              name: record.swappedWith,
                            })}
                          </span>
                        )}
                        {record.exemptionReason && (
                          <span>{record.exemptionReason}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge className={config.color}>
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {t(`hosting.hostingStatus.${record.status}`)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
