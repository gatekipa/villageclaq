"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CalendarDays,
  MapPin,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

type EventType = "meeting" | "social" | "fundraiser" | "agm" | "emergency" | "other";
type RsvpResponse = "yes" | "no" | "maybe";

interface MyEvent {
  id: string;
  title: string;
  location: string;
  locationMapUrl: string;
  eventType: EventType;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "completed";
  rsvps: { yes: number; no: number; maybe: number };
  myRsvp: RsvpResponse | null;
  attended: boolean | null; // for past events
}

const mockEvents: MyEvent[] = [
  {
    id: "1",
    title: "Monthly General Assembly",
    location: "Community Hall, Douala",
    locationMapUrl: "https://maps.google.com/?q=Community+Hall+Douala+Cameroon",
    eventType: "meeting",
    startsAt: "2026-04-05T18:00:00",
    endsAt: "2026-04-05T20:00:00",
    status: "upcoming",
    rsvps: { yes: 12, no: 3, maybe: 3 },
    myRsvp: "yes",
    attended: null,
  },
  {
    id: "2",
    title: "Cultural Gala Night",
    location: "Hilton Hotel, Yaound\u00e9",
    locationMapUrl: "https://maps.google.com/?q=Hilton+Hotel+Yaounde+Cameroon",
    eventType: "social",
    startsAt: "2026-04-12T19:00:00",
    endsAt: "2026-04-12T23:00:00",
    status: "upcoming",
    rsvps: { yes: 41, no: 2, maybe: 4 },
    myRsvp: null,
    attended: null,
  },
  {
    id: "3",
    title: "Fundraiser for School Project",
    location: "Community Center, Bamenda",
    locationMapUrl: "https://maps.google.com/?q=Community+Center+Bamenda+Cameroon",
    eventType: "fundraiser",
    startsAt: "2026-04-20T14:00:00",
    endsAt: "2026-04-20T18:00:00",
    status: "upcoming",
    rsvps: { yes: 25, no: 8, maybe: 12 },
    myRsvp: "maybe",
    attended: null,
  },
  {
    id: "4",
    title: "Annual General Meeting",
    location: "Town Hall, Buea",
    locationMapUrl: "https://maps.google.com/?q=Town+Hall+Buea+Cameroon",
    eventType: "agm",
    startsAt: "2026-05-15T09:00:00",
    endsAt: "2026-05-15T17:00:00",
    status: "upcoming",
    rsvps: { yes: 20, no: 0, maybe: 15 },
    myRsvp: null,
    attended: null,
  },
  // Past events
  {
    id: "5",
    title: "February General Assembly",
    location: "Community Hall, Douala",
    locationMapUrl: "https://maps.google.com/?q=Community+Hall+Douala+Cameroon",
    eventType: "meeting",
    startsAt: "2026-02-28T18:00:00",
    endsAt: "2026-02-28T20:00:00",
    status: "completed",
    rsvps: { yes: 38, no: 4, maybe: 5 },
    myRsvp: "yes",
    attended: true,
  },
  {
    id: "6",
    title: "New Year Celebration",
    location: "Grand Hotel, Douala",
    locationMapUrl: "https://maps.google.com/?q=Grand+Hotel+Douala+Cameroon",
    eventType: "social",
    startsAt: "2026-01-04T19:00:00",
    endsAt: "2026-01-04T23:00:00",
    status: "completed",
    rsvps: { yes: 50, no: 5, maybe: 8 },
    myRsvp: "yes",
    attended: true,
  },
  {
    id: "7",
    title: "Emergency Meeting on Land Dispute",
    location: "Chief's Palace, Limb\u00e9",
    locationMapUrl: "https://maps.google.com/?q=Chiefs+Palace+Limbe+Cameroon",
    eventType: "emergency",
    startsAt: "2026-01-18T10:00:00",
    endsAt: "2026-01-18T12:00:00",
    status: "completed",
    rsvps: { yes: 30, no: 10, maybe: 2 },
    myRsvp: "no",
    attended: false,
  },
];

const eventTypeColors: Record<EventType, string> = {
  meeting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  social: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  fundraiser: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  agm: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  emergency: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const eventTypeDotColors: Record<EventType, string> = {
  meeting: "bg-blue-500",
  social: "bg-purple-500",
  fundraiser: "bg-emerald-500",
  agm: "bg-amber-500",
  emergency: "bg-red-500",
  other: "bg-gray-500",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function MyEventsPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 3)); // April 2026
  const [rsvpState, setRsvpState] = useState<Record<string, RsvpResponse | null>>(() => {
    const initial: Record<string, RsvpResponse | null> = {};
    mockEvents.forEach((e) => {
      initial[e.id] = e.myRsvp;
    });
    return initial;
  });

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = calendarDate.toLocaleDateString("en", { month: "long", year: "numeric" });

  const upcomingEvents = mockEvents.filter((e) => e.status === "upcoming");
  const pastEvents = mockEvents.filter((e) => e.status === "completed");

  const allEvents = mockEvents;
  const eventsInMonth = allEvents.filter((e) => {
    const d = new Date(e.startsAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const getEventsForDay = (day: number) => {
    return eventsInMonth.filter((e) => new Date(e.startsAt).getDate() === day);
  };

  const handleRsvp = (eventId: string, response: RsvpResponse) => {
    setRsvpState((prev) => ({
      ...prev,
      [eventId]: prev[eventId] === response ? null : response,
    }));
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  };

  const formatMonth = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en", { month: "short" });
  };

  const formatDay = (dateStr: string) => {
    return new Date(dateStr).getDate();
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const weekDays = [
    t("myEvents.sun"),
    t("myEvents.mon"),
    t("myEvents.tue"),
    t("myEvents.wed"),
    t("myEvents.thu"),
    t("myEvents.fri"),
    t("myEvents.sat"),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("myEvents.title")}
        </h1>
        <p className="text-muted-foreground">{t("myEvents.subtitle")}</p>
      </div>

      {/* Tab Toggle + Calendar Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant={tab === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("upcoming")}
          >
            <Calendar className="mr-1 h-4 w-4" />
            {t("myEvents.upcoming")}
          </Button>
          <Button
            variant={tab === "past" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("past")}
          >
            <Clock className="mr-1 h-4 w-4" />
            {t("myEvents.past")}
          </Button>
        </div>
        <Button
          variant={showCalendar ? "default" : "outline"}
          size="sm"
          onClick={() => setShowCalendar(!showCalendar)}
        >
          <CalendarDays className="mr-1 h-4 w-4" />
          {t("myEvents.calendar")}
        </Button>
      </div>

      {/* Calendar Month View */}
      {showCalendar && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCalendarDate(new Date(year, month - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base">{monthName}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCalendarDate(new Date(year, month + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {weekDays.map((day) => (
                <div key={day} className="py-1 font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvents = getEventsForDay(day);
                const isToday =
                  day === new Date().getDate() &&
                  month === new Date().getMonth() &&
                  year === new Date().getFullYear();
                return (
                  <div
                    key={day}
                    className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors hover:bg-muted ${
                      isToday ? "bg-primary/10 font-bold text-primary" : ""
                    }`}
                  >
                    <span className="text-sm">{day}</span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5">
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className={`h-1.5 w-1.5 rounded-full ${eventTypeDotColors[event.eventType]}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {(["meeting", "social", "fundraiser", "agm", "emergency"] as EventType[]).map(
                (type) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${eventTypeDotColors[type]}`} />
                    <span>{t(`events.eventTypes.${type}`)}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Events */}
      {tab === "upcoming" && (
        <div className="space-y-3">
          {upcomingEvents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">{t("myEvents.noUpcoming")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("myEvents.noUpcomingDesc")}
                </p>
              </CardContent>
            </Card>
          ) : (
            upcomingEvents.map((event) => (
              <Card key={event.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    {/* Date Tile */}
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                      <span className="text-xs font-medium text-primary">
                        {formatMonth(event.startsAt)}
                      </span>
                      <span className="text-xl font-bold leading-none text-primary">
                        {formatDay(event.startsAt)}
                      </span>
                    </div>

                    {/* Event Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{event.title}</h3>
                        <Badge className={eventTypeColors[event.eventType]} variant="secondary">
                          {t(`events.eventTypes.${event.eventType}`)}
                        </Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime(event.startsAt)} - {formatTime(event.endsAt)}
                        </span>
                        <a
                          href={event.locationMapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          {event.location}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>

                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>
                          {t("myEvents.rsvpSummary", {
                            attending: event.rsvps.yes,
                            maybe: event.rsvps.maybe,
                          })}
                        </span>
                      </div>

                      {/* RSVP Buttons */}
                      <div className="mt-3 flex gap-1.5">
                        <Button
                          size="sm"
                          variant={rsvpState[event.id] === "yes" ? "default" : "outline"}
                          onClick={() => handleRsvp(event.id, "yes")}
                          className="h-8"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {t("events.rsvpYes")}
                        </Button>
                        <Button
                          size="sm"
                          variant={rsvpState[event.id] === "maybe" ? "secondary" : "outline"}
                          onClick={() => handleRsvp(event.id, "maybe")}
                          className="h-8"
                        >
                          <HelpCircle className="mr-1 h-3.5 w-3.5" />
                          {t("events.rsvpMaybe")}
                        </Button>
                        <Button
                          size="sm"
                          variant={rsvpState[event.id] === "no" ? "destructive" : "outline"}
                          onClick={() => handleRsvp(event.id, "no")}
                          className="h-8"
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          {t("events.rsvpNo")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Past Events */}
      {tab === "past" && (
        <div className="space-y-3">
          {pastEvents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">{t("myEvents.noPast")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("myEvents.noPastDesc")}
                </p>
              </CardContent>
            </Card>
          ) : (
            pastEvents.map((event) => (
              <Card key={event.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      {/* Date Tile */}
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {formatMonth(event.startsAt)}
                        </span>
                        <span className="text-lg font-bold leading-none">
                          {formatDay(event.startsAt)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{event.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {formatFullDate(event.startsAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={eventTypeColors[event.eventType]} variant="secondary">
                        {t(`events.eventTypes.${event.eventType}`)}
                      </Badge>
                      {event.attended === true && (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {t("myEvents.attended")}
                        </Badge>
                      )}
                      {event.attended === false && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <XCircle className="mr-1 h-3 w-3" />
                          {t("myEvents.missed")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
