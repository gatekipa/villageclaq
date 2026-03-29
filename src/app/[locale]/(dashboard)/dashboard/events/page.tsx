"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  CalendarDays,
  List,
  Plus,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  XCircle,
  Loader2,
  Copy,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEvents, useCreateEvent } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { PermissionGate } from "@/components/ui/permission-gate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type EventType = "meeting" | "social" | "fundraiser" | "agm" | "emergency" | "other";

const eventTypeColors: Record<string, string> = {
  meeting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  social: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  fundraiser: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  agm: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  emergency: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const EVENT_TYPES: EventType[] = ["meeting", "social", "fundraiser", "agm", "emergency", "other"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function EventsPage() {
  const locale = useLocale();
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const { groupId, currentMembership, user } = useGroup();
  const { hasPermission } = usePermissions();
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const createEvent = useCreateEvent();
  const queryClient = useQueryClient();

  // RSVP: query current user's RSVPs for all events
  const { data: myRsvps } = useQuery({
    queryKey: ["my-rsvps", currentMembership?.id],
    queryFn: async () => {
      if (!currentMembership?.id) return [];
      const supabase = createClient();
      const { data } = await supabase
        .from("event_rsvps")
        .select("event_id, response")
        .eq("membership_id", currentMembership.id);
      return data || [];
    },
    enabled: !!currentMembership?.id,
  });

  // RSVP: query counts per event
  const { data: rsvpCounts } = useQuery({
    queryKey: ["rsvp-counts", groupId],
    queryFn: async () => {
      if (!groupId || !events) return {};
      const supabase = createClient();
      const eventIds = events.map((e: Record<string, unknown>) => e.id as string);
      if (eventIds.length === 0) return {};
      const { data } = await supabase
        .from("event_rsvps")
        .select("event_id, response")
        .in("event_id", eventIds);
      const counts: Record<string, { yes: number; no: number; maybe: number }> = {};
      for (const r of (data || [])) {
        if (!counts[r.event_id]) counts[r.event_id] = { yes: 0, no: 0, maybe: 0 };
        if (r.response === "yes") counts[r.event_id].yes++;
        else if (r.response === "no") counts[r.event_id].no++;
        else if (r.response === "maybe") counts[r.event_id].maybe++;
      }
      return counts;
    },
    enabled: !!groupId && !!events && events.length > 0,
  });

  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);

  async function handleRsvp(eventId: string, response: "yes" | "no" | "maybe") {
    if (!currentMembership?.id) return;
    setRsvpLoading(eventId);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("event_rsvps").upsert(
        { event_id: eventId, membership_id: currentMembership.id, response, responded_at: new Date().toISOString() },
        { onConflict: "event_id,membership_id" }
      );
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["my-rsvps"] });
      queryClient.invalidateQueries({ queryKey: ["rsvp-counts"] });
    } catch {
      showError(t("rsvpFailed"));
    } finally {
      setRsvpLoading(null);
    }
  }

  const [view, setView] = useState<"calendar" | "list">("list");
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  // Action error notification
  const [actionError, setActionError] = useState<string | null>(null);
  function showError(msg: string) {
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  }
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formTitleFr, setFormTitleFr] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEventType, setFormEventType] = useState<EventType>("meeting");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurrenceRule, setFormRecurrenceRule] = useState<string>("monthly");
  // Attendance is tracked for all events by default (no per-event toggle — no DB column exists)
  // RSVP is enabled by default for all upcoming events (no per-event toggle — no DB column exists)
  const [preFilledBanner, setPreFilledBanner] = useState<string | null>(null);

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = calendarDate.toLocaleDateString(getDateLocale(locale), { month: "long", year: "numeric" });

  const now = new Date().toISOString();

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((e: Record<string, unknown>) => {
      if (filter === "upcoming") return (e.starts_at as string) >= now || e.status === "upcoming";
      if (filter === "past") return (e.starts_at as string) < now || e.status === "completed";
      return true;
    });
  }, [events, filter, now]);

  const eventsInMonth = useMemo(() => {
    if (!events) return [];
    return events.filter((e: Record<string, unknown>) => {
      const d = new Date(e.starts_at as string);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [events, year, month]);

  const getEventsForDay = (day: number) => {
    return eventsInMonth.filter(
      (e: Record<string, unknown>) => new Date(e.starts_at as string).getDate() === day
    );
  };

  const resetForm = () => {
    setFormTitle("");
    setFormTitleFr("");
    setFormDescription("");
    setFormEventType("meeting");
    setFormStartsAt("");
    setFormEndsAt("");
    setFormLocation("");
    setFormIsRecurring(false);
    setFormRecurrenceRule("monthly");
    setPreFilledBanner(null);
  };

  const handleRepeatLastMeeting = () => {
    if (!events || events.length === 0) return;

    // Find the most recent event
    const sorted = [...events].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        new Date(b.starts_at as string).getTime() - new Date(a.starts_at as string).getTime()
    );
    const lastEvent = sorted[0] as Record<string, unknown>;
    if (!lastEvent) return;

    // Pre-fill form fields
    setFormTitle(lastEvent.title as string || "");
    setFormTitleFr(lastEvent.title_fr as string || "");
    setFormDescription(lastEvent.description as string || "");
    setFormEventType((lastEvent.event_type as EventType) || "meeting");
    setFormLocation(lastEvent.location as string || "");
    setFormIsRecurring(!!lastEvent.is_recurring);
    setFormRecurrenceRule((lastEvent.recurrence_rule as string) || "monthly");

    // Advance the date
    const lastDate = new Date(lastEvent.starts_at as string);
    const rule = (lastEvent.recurrence_rule as string) || "monthly";
    if (rule === "weekly") {
      lastDate.setDate(lastDate.getDate() + 7);
    } else if (rule === "biweekly") {
      lastDate.setDate(lastDate.getDate() + 14);
    } else {
      lastDate.setMonth(lastDate.getMonth() + 1);
    }

    // Format for datetime-local input
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${lastDate.getFullYear()}-${pad(lastDate.getMonth() + 1)}-${pad(lastDate.getDate())}T${pad(lastDate.getHours())}:${pad(lastDate.getMinutes())}`;
    setFormStartsAt(dateStr);

    if (lastEvent.ends_at) {
      const lastEnd = new Date(lastEvent.ends_at as string);
      const duration = lastEnd.getTime() - new Date(lastEvent.starts_at as string).getTime();
      const newEnd = new Date(lastDate.getTime() + duration);
      const endStr = `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`;
      setFormEndsAt(endStr);
    }

    setPreFilledBanner(
      t("preFilledFrom", {
        title: lastEvent.title as string,
        date: new Date(lastEvent.starts_at as string).toLocaleDateString(),
      })
    );
    setEditEventId(null);
    setShowCreateDialog(true);
  };

  const handleCreateEvent = async () => {
    if (!formTitle || !formStartsAt) return;
    try {
      await createEvent.mutateAsync({
        title: formTitle,
        title_fr: formTitleFr || null,
        description: formDescription || null,
        event_type: formEventType,
        starts_at: new Date(formStartsAt).toISOString(),
        ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : null,
        location: formLocation || null,
        is_recurring: formIsRecurring,
        recurrence_rule: formIsRecurring ? formRecurrenceRule : null,
      });
      setShowCreateDialog(false);
      resetForm();
    } catch (err) {
      showError((err as Error).message || tc("error"));
    }
  };

  function openEditEvent(event: Record<string, unknown>) {
    setEditEventId(event.id as string);
    setFormTitle(event.title as string);
    setFormTitleFr((event.title_fr as string) || "");
    setFormDescription((event.description as string) || "");
    setFormEventType((event.event_type as EventType) || "meeting");
    const startsAtDate = new Date(event.starts_at as string);
    setFormStartsAt(startsAtDate.toISOString().slice(0, 16));
    if (event.ends_at) {
      const endsAtDate = new Date(event.ends_at as string);
      setFormEndsAt(endsAtDate.toISOString().slice(0, 16));
    } else {
      setFormEndsAt("");
    }
    setFormLocation((event.location as string) || "");
    setFormIsRecurring(!!(event.is_recurring));
    setFormRecurrenceRule((event.recurrence_rule as string) || "monthly");
    setShowCreateDialog(true);
  }

  async function handleEditEvent() {
    if (!editEventId || !formTitle || !formStartsAt) return;
    setEditSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("events")
        .update({
          title: formTitle,
          title_fr: formTitleFr || null,
          description: formDescription || null,
          event_type: formEventType,
          starts_at: new Date(formStartsAt).toISOString(),
          ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : null,
          location: formLocation || null,
          is_recurring: formIsRecurring,
          recurrence_rule: formIsRecurring ? formRecurrenceRule : null,
        })
        .eq("id", editEventId);
      if (updateError) throw updateError;
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setShowCreateDialog(false);
      resetForm();
      setEditEventId(null);
    } catch (err) {
      showError((err as Error).message || tc("error"));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCancelEvent(eventId: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("events").update({ status: "cancelled" }).eq("id", eventId);
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      showError((err as Error).message || tc("error"));
    }
  }

  async function handleDeleteEvent(eventId: string) {
    setDeletingId(eventId);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("events").delete().eq("id", eventId);
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      showError((err as Error).message || tc("error"));
    } finally {
      setDeletingId(null);
      setShowDeleteConfirm(null);
    }
  }

  if (isLoading) {
    return <ListSkeleton rows={5} />;
  }

  if (isError) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {hasPermission("events.manage") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRepeatLastMeeting} disabled={!events || events.length === 0}>
              <Copy className="mr-2 h-4 w-4" />
              {t("repeatLastMeeting")}
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("createEvent")}
            </Button>
          </div>
        )}
      </div>

      {/* Error notification */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto text-destructive/70 hover:text-destructive">✕</button>
        </div>
      )}

      {/* View Toggle + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant={filter === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("upcoming")}
          >
            {tc("upcoming")}
          </Button>
          <Button
            variant={filter === "past" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("past")}
          >
            {tc("past")}
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            {tc("all")}
          </Button>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
          >
            <List className="mr-1 h-4 w-4" />
            {t("listView")}
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("calendar")}
          >
            <CalendarDays className="mr-1 h-4 w-4" />
            {t("calendarView")}
          </Button>
        </div>
      </div>

      {/* Calendar View */}
      {view === "calendar" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Button variant="ghost" size="icon" onClick={() => setCalendarDate(new Date(year, month - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base">{monthName}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCalendarDate(new Date(year, month + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {Array.from({ length: 7 }, (_, i) => new Date(2023, 11, 31 + i).toLocaleDateString(getDateLocale(locale), { weekday: "short" })).map((day) => (
                <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[60px] p-1" />
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
                    className={`min-h-[60px] rounded-lg border p-1 transition-colors hover:bg-muted/50 ${
                      isToday ? "border-primary bg-primary/5" : "border-transparent"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-primary" : ""}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.map((event: Record<string, unknown>) => (
                        <div
                          key={event.id as string}
                          className={`w-full truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            eventTypeColors[(event.event_type as string) || "other"]
                          }`}
                        >
                          {event.title as string}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {view === "list" && (
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title={t("noEvents")}
              description={t("noEventsDesc")}
              action={
                hasPermission("events.manage") ? (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("createEvent")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            filteredEvents.map((event: Record<string, unknown>) => {
              const startsAt = new Date(event.starts_at as string);
              const endsAt = event.ends_at ? new Date(event.ends_at as string) : null;
              const eventType = (event.event_type as string) || "other";
              const isPast = startsAt < new Date();

              return (
                <Card key={event.id as string} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      {/* Date block + info */}
                      <div className="flex gap-4 flex-1 min-w-0">
                        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                          <span className="text-xs font-medium text-primary">
                            {startsAt.toLocaleDateString(getDateLocale(locale), { month: "short" })}
                          </span>
                          <span className="text-xl font-bold leading-none text-primary">
                            {startsAt.getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{event.title as string}</h3>
                            <Badge className={eventTypeColors[eventType]} variant="secondary">
                              {t(`eventTypes.${eventType}`)}
                            </Badge>
                            {isPast && (
                              <Badge variant="outline" className="text-muted-foreground">
                                {tc("completed")}
                              </Badge>
                            )}
                            {(event.status as string) === "cancelled" && (
                              <Badge variant="destructive">
                                {tc("cancelled")}
                              </Badge>
                            )}
                          </div>
                          {event.description ? (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                              {String(event.description)}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {startsAt.toLocaleTimeString(getDateLocale(locale), { hour: "2-digit", minute: "2-digit" })}
                              {endsAt && ` - ${endsAt.toLocaleTimeString(getDateLocale(locale), { hour: "2-digit", minute: "2-digit" })}`}
                            </span>
                            {event.location ? (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {String(event.location)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {hasPermission("events.manage") && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditEvent(event)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {tc("edit")}
                            </DropdownMenuItem>
                            {(event.status as string) !== "cancelled" && (
                              <DropdownMenuItem onClick={() => handleCancelEvent(event.id as string)}>
                                <XCircle className="mr-2 h-4 w-4" />
                                {t("cancelEvent")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setShowDeleteConfirm(event.id as string)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tc("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* RSVP Section — show for upcoming, non-cancelled events when user is authenticated (not proxy) */}
                    {!isPast && (event.status as string) !== "cancelled" && currentMembership && user && (() => {
                      const eventId = event.id as string;
                      const myRsvp = (myRsvps || []).find((r: Record<string, unknown>) => r.event_id === eventId);
                      const currentResponse = myRsvp?.response as string | undefined;
                      const counts = (rsvpCounts as Record<string, { yes: number; no: number; maybe: number }> || {})[eventId];
                      const isSubmitting = rsvpLoading === eventId;

                      return (
                        <div className="border-t pt-3 mt-3 space-y-2">
                          {/* RSVP Buttons */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground mr-1">{t("rsvp")}:</span>
                            {(["yes", "no", "maybe"] as const).map((resp) => {
                              const isSelected = currentResponse === resp;
                              const label = resp === "yes" ? t("rsvpYes") : resp === "no" ? t("rsvpNo") : t("rsvpMaybe");
                              return (
                                <Button
                                  key={resp}
                                  size="sm"
                                  variant={isSelected ? "default" : "outline"}
                                  className={cn("h-7 text-xs", isSelected && resp === "yes" && "bg-emerald-600 hover:bg-emerald-700", isSelected && resp === "no" && "bg-red-600 hover:bg-red-700", isSelected && resp === "maybe" && "bg-amber-600 hover:bg-amber-700")}
                                  disabled={isSubmitting}
                                  onClick={() => handleRsvp(eventId, resp)}
                                >
                                  {isSubmitting && currentResponse !== resp ? null : null}
                                  {label}
                                </Button>
                              );
                            })}
                            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          </div>
                          {/* RSVP Counts */}
                          {counts && (counts.yes > 0 || counts.maybe > 0 || counts.no > 0) ? (
                            <div className="flex gap-3 text-[10px] text-muted-foreground">
                              {counts.yes > 0 && <span className="text-emerald-600 dark:text-emerald-400">{t("rsvpCount", { count: counts.yes })}</span>}
                              {counts.maybe > 0 && <span className="text-amber-600 dark:text-amber-400">{t("rsvpMaybeCount", { count: counts.maybe })}</span>}
                              {counts.no > 0 && <span className="text-red-600 dark:text-red-400">{t("rsvpNoCount", { count: counts.no })}</span>}
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">{t("noResponses")}</p>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Delete Event Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tc("confirmDeleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("deleteEventConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" disabled={!!deletingId} onClick={() => showDeleteConfirm && handleDeleteEvent(showDeleteConfirm)}>
              {deletingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) { resetForm(); setEditEventId(null); } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEventId ? t("editEvent") : t("createEvent")}</DialogTitle>
          </DialogHeader>
          {preFilledBanner && (
            <div className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
              <Copy className="inline-block mr-1.5 h-3.5 w-3.5" />
              {preFilledBanner}
            </div>
          )}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("titleEn")} <span className="text-red-500">*</span></Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={t("titlePlaceholderEn")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("titleFr")}</Label>
                <Input
                  value={formTitleFr}
                  onChange={(e) => setFormTitleFr(e.target.value)}
                  placeholder={t("titlePlaceholderFr")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("eventType")}</Label>
              <Select value={formEventType} onValueChange={(v) => setFormEventType(v as EventType)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`eventTypes.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("startDateTime")} <span className="text-red-500">*</span></Label>
                <Input
                  type="datetime-local"
                  value={formStartsAt}
                  onChange={(e) => setFormStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("endDateTime")}</Label>
                <Input
                  type="datetime-local"
                  value={formEndsAt}
                  onChange={(e) => setFormEndsAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("location")}</Label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder={t("locationPlaceholder")}
              />
            </div>

            {/* Recurring toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("recurring")}</p>
                <p className="text-xs text-muted-foreground">{t("recurringHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formIsRecurring}
                onClick={() => setFormIsRecurring(!formIsRecurring)}
                className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", formIsRecurring ? "bg-primary" : "bg-muted")}
              >
                <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform", formIsRecurring ? "translate-x-5" : "translate-x-0")} />
              </button>
            </div>

            {formIsRecurring && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <Label>{t("recurrenceRule")}</Label>
                <Select value={formRecurrenceRule} onValueChange={(v) => v && setFormRecurrenceRule(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{t("weekly")}</SelectItem>
                    <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                    <SelectItem value="monthly">{t("monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Attendance is tracked for all events by default — no per-event toggle */}
            {/* RSVP is enabled by default for all upcoming events — no per-event control */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); setEditEventId(null); }}>
              {tc("cancel")}
            </Button>
            {editEventId ? (
              <Button
                onClick={handleEditEvent}
                disabled={!formTitle || !formStartsAt || editSaving}
              >
                {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("updateEvent")}
              </Button>
            ) : (
              <Button
                onClick={handleCreateEvent}
                disabled={!formTitle || !formStartsAt || createEvent.isPending}
              >
                {createEvent.isPending ? tc("loading") : t("saveEvent")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
