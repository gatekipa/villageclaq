"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { useEvents } from "@/lib/hooks/use-supabase-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-skeleton";
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
  AlertCircle,
} from "lucide-react";

const supabase = createClient();

type EventType = "meeting" | "social" | "fundraiser" | "agm" | "emergency" | "other";
type RsvpResponse = "yes" | "no" | "maybe";

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

function useMyRsvps(groupId: string | null, membershipId: string | null) {
  return useQuery({
    queryKey: ["my-rsvps", groupId, membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("event_rsvps")
        .select("id, event_id, response")
        .eq("membership_id", membershipId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

function useRsvpCounts(eventIds: string[]) {
  return useQuery({
    queryKey: ["rsvp-counts", eventIds],
    queryFn: async () => {
      if (eventIds.length === 0) return {};
      const { data, error } = await supabase
        .from("event_rsvps")
        .select("event_id, response")
        .in("event_id", eventIds);
      if (error) throw error;
      const counts: Record<string, { yes: number; no: number; maybe: number }> = {};
      (data || []).forEach((r: Record<string, unknown>) => {
        const eid = r.event_id as string;
        if (!counts[eid]) counts[eid] = { yes: 0, no: 0, maybe: 0 };
        const response = r.response as RsvpResponse;
        if (counts[eid][response] !== undefined) counts[eid][response]++;
      });
      return counts;
    },
    enabled: eventIds.length > 0,
  });
}

function useMyAttendances(membershipId: string | null) {
  return useQuery({
    queryKey: ["my-event-attendances", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("event_attendances")
        .select("event_id, status")
        .eq("membership_id", membershipId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

export default function MyEventsPage() {
  const locale = useLocale();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { groupId, currentMembership } = useGroup();
  const membershipId = currentMembership?.id || null;

  const { data: events = [], isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = useEvents();
  const { data: myRsvps = [] } = useMyRsvps(groupId, membershipId);
  const eventIds = useMemo(() => events.map((e: Record<string, unknown>) => e.id as string), [events]);
  const { data: rsvpCounts = {} } = useRsvpCounts(eventIds);
  const { data: myAttendances = [] } = useMyAttendances(membershipId);

  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth());
  });

  // Build lookup maps
  const rsvpByEvent = useMemo(() => {
    const map: Record<string, RsvpResponse> = {};
    myRsvps.forEach((r: Record<string, unknown>) => {
      map[r.event_id as string] = r.response as RsvpResponse;
    });
    return map;
  }, [myRsvps]);

  const attendanceByEvent = useMemo(() => {
    const map: Record<string, string> = {};
    myAttendances.forEach((a: Record<string, unknown>) => {
      map[a.event_id as string] = a.status as string;
    });
    return map;
  }, [myAttendances]);

  // RSVP mutation
  const rsvpMutation = useMutation({
    mutationFn: async ({ eventId, response }: { eventId: string; response: RsvpResponse }) => {
      if (!membershipId) throw new Error("No membership");
      // Upsert the RSVP
      const { error } = await supabase
        .from("event_rsvps")
        .upsert(
          { event_id: eventId, membership_id: membershipId, response },
          { onConflict: "event_id,membership_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rsvps", groupId, membershipId] });
      queryClient.invalidateQueries({ queryKey: ["rsvp-counts"] });
    },
    onError: () => {
      setActionError(t("myEvents.rsvpFailed"));
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const deleteRsvpMutation = useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      if (!membershipId) throw new Error("No membership");
      const { error } = await supabase
        .from("event_rsvps")
        .delete()
        .eq("event_id", eventId)
        .eq("membership_id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rsvps", groupId, membershipId] });
      queryClient.invalidateQueries({ queryKey: ["rsvp-counts"] });
    },
    onError: () => {
      setActionError(t("myEvents.rsvpFailed"));
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const handleRsvp = useCallback(
    (eventId: string, response: RsvpResponse) => {
      const current = rsvpByEvent[eventId];
      if (current === response) {
        // Toggle off
        deleteRsvpMutation.mutate({ eventId });
      } else {
        rsvpMutation.mutate({ eventId, response });
      }
    },
    [rsvpByEvent, rsvpMutation, deleteRsvpMutation]
  );

  const now = new Date();
  const upcomingEvents = useMemo(
    () => events.filter((e: Record<string, unknown>) => new Date(e.starts_at as string) >= now && e.status !== "cancelled"),
    [events]
  );
  const pastEvents = useMemo(
    () => events.filter((e: Record<string, unknown>) => new Date(e.starts_at as string) < now || e.status === "completed"),
    [events]
  );

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = calendarDate.toLocaleDateString(getDateLocale(locale), { month: "long", year: "numeric" });

  const eventsInMonth = useMemo(
    () =>
      events.filter((e: Record<string, unknown>) => {
        const d = new Date(e.starts_at as string);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [events, year, month]
  );

  const getEventsForDay = (day: number) => {
    return eventsInMonth.filter((e: Record<string, unknown>) => new Date(e.starts_at as string).getDate() === day);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(getDateLocale(locale), { hour: "2-digit", minute: "2-digit" });
  };

  const formatMonth = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), { month: "short" });
  };

  const formatDay = (dateStr: string) => {
    return new Date(dateStr).getDate();
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), {
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

  // Loading state
  if (eventsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (eventsError) {
    return (
      <ErrorState
        message={(eventsError as Error)?.message}
        onRetry={() => refetchEvents()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {actionError}
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
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
                        {dayEvents.map((event: Record<string, unknown>) => (
                          <div
                            key={event.id as string}
                            className={`h-1.5 w-1.5 rounded-full ${eventTypeDotColors[(event.event_type as EventType) || "other"]}`}
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
            upcomingEvents.map((event: Record<string, unknown>) => {
              const eventId = event.id as string;
              const eventType = (event.event_type as EventType) || "other";
              const startsAt = event.starts_at as string;
              const endsAt = event.ends_at as string | null;
              const counts = (rsvpCounts as Record<string, { yes: number; no: number; maybe: number }>)[eventId] || { yes: 0, no: 0, maybe: 0 };
              const myRsvp = rsvpByEvent[eventId] || null;

              return (
                <Card key={eventId} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {/* Date Tile */}
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                        <span className="text-xs font-medium text-primary">
                          {formatMonth(startsAt)}
                        </span>
                        <span className="text-xl font-bold leading-none text-primary">
                          {formatDay(startsAt)}
                        </span>
                      </div>

                      {/* Event Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{event.title as string}</h3>
                          <Badge className={eventTypeColors[eventType]} variant="secondary">
                            {t(`events.eventTypes.${eventType}`)}
                          </Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatTime(startsAt)}{endsAt ? ` - ${formatTime(endsAt)}` : ""}
                          </span>
                          {event.location ? (
                            event.location_map_url ? (
                              <a
                                href={event.location_map_url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <MapPin className="h-3.5 w-3.5" />
                                {event.location as string}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : /^https?:\/\//i.test(event.location as string) ? (
                              <a
                                href={event.location as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <MapPin className="h-3.5 w-3.5" />
                                {event.location as string}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {event.location as string}
                              </span>
                            )
                          ) : null}
                        </div>

                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          <span>
                            {t("myEvents.rsvpSummary", {
                              attending: counts.yes,
                              maybe: counts.maybe,
                            })}
                          </span>
                        </div>

                        {/* RSVP Buttons */}
                        <div className="mt-3 flex gap-1.5">
                          <Button
                            size="sm"
                            variant={myRsvp === "yes" ? "default" : "outline"}
                            onClick={() => handleRsvp(eventId, "yes")}
                            className="h-8"
                            disabled={rsvpMutation.isPending || deleteRsvpMutation.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            {t("events.rsvpYes")}
                          </Button>
                          <Button
                            size="sm"
                            variant={myRsvp === "maybe" ? "secondary" : "outline"}
                            onClick={() => handleRsvp(eventId, "maybe")}
                            className="h-8"
                            disabled={rsvpMutation.isPending || deleteRsvpMutation.isPending}
                          >
                            <HelpCircle className="mr-1 h-3.5 w-3.5" />
                            {t("events.rsvpMaybe")}
                          </Button>
                          <Button
                            size="sm"
                            variant={myRsvp === "no" ? "destructive" : "outline"}
                            onClick={() => handleRsvp(eventId, "no")}
                            className="h-8"
                            disabled={rsvpMutation.isPending || deleteRsvpMutation.isPending}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            {t("events.rsvpNo")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
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
            pastEvents.map((event: Record<string, unknown>) => {
              const eventId = event.id as string;
              const eventType = (event.event_type as EventType) || "other";
              const startsAt = event.starts_at as string;
              const attended = attendanceByEvent[eventId];

              return (
                <Card key={eventId} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        {/* Date Tile */}
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {formatMonth(startsAt)}
                          </span>
                          <span className="text-lg font-bold leading-none">
                            {formatDay(startsAt)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{event.title as string}</h3>
                          <p className="text-xs text-muted-foreground">
                            {formatFullDate(startsAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={eventTypeColors[eventType]} variant="secondary">
                          {t(`events.eventTypes.${eventType}`)}
                        </Badge>
                        {(attended === "present" || attended === "late") && (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {t("myEvents.attended")}
                          </Badge>
                        )}
                        {attended === "absent" && (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                            <XCircle className="mr-1 h-3 w-3" />
                            {t("myEvents.missed")}
                          </Badge>
                        )}
                        {attended === "excused" && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            {t("myAttendance.status.excused")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
