"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MapPin,
  Calendar,
  Clock,
  Bell,
  X,
  Sparkles,
  User,
  ArrowRight,
  Home,
} from "lucide-react";

// Mock data
const standing = {
  isGood: true,
};

const outstandingPayments = [
  {
    id: "1",
    label: "Monthly Dues - March 2026",
    amount: 15000,
    dueDate: "2026-04-05",
    urgency: "upcoming" as const,
  },
  {
    id: "2",
    label: "Special Levy - Building Fund",
    amount: 50000,
    dueDate: "2026-03-28",
    urgency: "due_soon" as const,
  },
  {
    id: "3",
    label: "Monthly Dues - February 2026",
    amount: 15000,
    dueDate: "2026-03-01",
    urgency: "overdue" as const,
  },
];

const upcomingEvents = [
  {
    id: "1",
    title: "Monthly General Assembly",
    date: "2026-03-28",
    time: "6:00 PM",
    location: "Chez Mme Ngo Bassa, Bonanjo",
  },
  {
    id: "2",
    title: "Youth Committee Meeting",
    date: "2026-04-05",
    time: "3:00 PM",
    location: "Salle Polyvalente, Akwa",
  },
  {
    id: "3",
    title: "Annual Cultural Celebration",
    date: "2026-04-19",
    time: "10:00 AM",
    location: "Hotel Sawa, Douala",
  },
];

const hostingAssignment = {
  eventTitle: "April General Assembly",
  date: "2026-04-28",
  daysUntil: 36,
  coHosts: ["Ngwa Fombang", "Achu Ndi"],
  location: "45 Rue de la Joie, Bonapriso, Douala",
};

const profileCompletion = 65;

const unreadNotifications = 4;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-CM", {
    style: "currency",
    currency: "XAF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const urgencyStyles = {
  upcoming: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40",
  due_soon: "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40",
  overdue: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40",
} as const;

const urgencyTextStyles = {
  upcoming: "text-emerald-700 dark:text-emerald-400",
  due_soon: "text-yellow-700 dark:text-yellow-400",
  overdue: "text-red-700 dark:text-red-400",
} as const;

const urgencyIconStyles = {
  upcoming: "text-emerald-500 dark:text-emerald-400",
  due_soon: "text-yellow-500 dark:text-yellow-400",
  overdue: "text-red-500 dark:text-red-400",
} as const;

export default function MyDashboardPage() {
  const t = useTranslations();
  const [explainerDismissed, setExplainerDismissed] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("myDashboard.title", { name: "Tatah Mboh" })}
        </h1>
        <p className="text-muted-foreground">{t("myDashboard.subtitle")}</p>
      </div>

      {/* Top Row: Standing + Notifications */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Standing Badge Card */}
        <Card>
          <CardContent className="flex items-center gap-4 pt-2">
            {standing.isGood ? (
              <>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0">
                    {t("myDashboard.goodStanding")}
                  </Badge>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("myDashboard.goodStandingDesc")}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <Badge variant="destructive">
                    {t("myDashboard.actionNeeded")}
                  </Badge>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("myDashboard.actionNeededDesc")}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Unread Notifications Card */}
        <Link href="/dashboard/notifications">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-4 pt-2">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-6 w-6 text-primary" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unreadNotifications}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t("myDashboard.unreadNotifications", { count: unreadNotifications })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("myDashboard.tapToView")}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Explainer Card for First-Time Users */}
      {!explainerDismissed && (
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm font-medium">
                {t("myDashboard.explainerTitle")}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setExplainerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("myDashboard.explainerPoint1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("myDashboard.explainerPoint2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("myDashboard.explainerPoint3")}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Outstanding Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t("myDashboard.outstandingPayments")}</CardTitle>
          <Link href="/dashboard/contributions">
            <Button variant="ghost" size="sm" className="text-xs text-primary">
              {t("common.viewAll")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {outstandingPayments.map((payment) => (
              <div
                key={payment.id}
                className={`flex items-center gap-3 rounded-lg border p-3 ${urgencyStyles[payment.urgency]}`}
              >
                <CreditCard className={`h-5 w-5 shrink-0 ${urgencyIconStyles[payment.urgency]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{payment.label}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-semibold ${urgencyTextStyles[payment.urgency]}`}>
                      {formatCurrency(payment.amount)}
                    </span>
                    <span className="text-muted-foreground">
                      {t("myDashboard.dueBy", { date: payment.dueDate })}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-[10px] ${urgencyTextStyles[payment.urgency]} border-current`}
                  >
                    {t(`myDashboard.urgency.${payment.urgency}`)}
                  </Badge>
                </div>
                <Button size="sm" className="shrink-0">
                  {t("myDashboard.payNow")}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events + Hosting Assignment */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming Events with RSVP */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("myDashboard.upcomingEvents")}</CardTitle>
            <Link href="/dashboard/events">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-xs font-medium text-primary">
                      {new Date(event.date).toLocaleDateString("en", { month: "short" })}
                    </span>
                    <span className="text-lg font-bold leading-none text-primary">
                      {new Date(event.date).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.time} - {event.location}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("myDashboard.rsvpYes")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {t("myDashboard.rsvpNo")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-950/40"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        {t("myDashboard.rsvpMaybe")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Hosting Assignment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("myDashboard.nextHosting")}</CardTitle>
            <Link href="/dashboard/hosting">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{hostingAssignment.eventTitle}</p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{hostingAssignment.date}</span>
                </div>

                {/* Countdown */}
                <div className="mt-2 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">
                    {t("myDashboard.daysUntilHosting", { days: hostingAssignment.daysUntil })}
                  </span>
                </div>

                {/* Co-hosts */}
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted-foreground">{t("myDashboard.coHosts")}</p>
                  <div className="flex items-center gap-2">
                    {hostingAssignment.coHosts.map((host) => (
                      <div key={host} className="flex items-center gap-1.5">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                            {host
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <Badge variant="secondary" className="text-xs">
                          {host}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hostingAssignment.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {hostingAssignment.location}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profile Completion */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("myDashboard.profileCompletion")}</p>
              <span className="text-sm font-semibold text-primary">{profileCompletion}%</span>
            </div>
            <Progress value={profileCompletion} className="mt-2" />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("myDashboard.completeProfile")}
            </p>
          </div>
          <Link href="/dashboard/settings">
            <Button size="sm" variant="outline">
              {t("myDashboard.completeProfileBtn")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
