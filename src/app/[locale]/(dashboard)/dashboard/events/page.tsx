"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Switch } from "@/components/ui/switch";
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
  Users,
  ChevronLeft,
  ChevronRight,
  Repeat,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  Copy,
  ClipboardCheck,
  FileText,
} from "lucide-react";

type EventType = "meeting" | "social" | "fundraiser" | "agm" | "emergency" | "other";
type RsvpResponse = "yes" | "no" | "maybe";

interface MockEvent {
  id: string;
  title: string;
  title_fr: string;
  description: string;
  location: string;
  location_map_url: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  status: "upcoming" | "completed" | "cancelled";
  rsvps: { yes: number; no: number; maybe: number };
  myRsvp: RsvpResponse | null;
}

const mockEvents: MockEvent[] = [
  {
    id: "1",
    title: "Monthly General Assembly",
    title_fr: "Assemblée générale mensuelle",
    description: "Regular monthly meeting for all members",
    location: "Community Hall, Douala",
    location_map_url: "",
    event_type: "meeting",
    starts_at: "2026-03-28T18:00:00",
    ends_at: "2026-03-28T20:00:00",
    is_recurring: true,
    recurrence_rule: "monthly",
    status: "upcoming",
    rsvps: { yes: 32, no: 5, maybe: 8 },
    myRsvp: "yes",
  },
  {
    id: "2",
    title: "Cultural Gala Night",
    title_fr: "Soirée gala culturelle",
    description: "Annual cultural celebration with food, music, and dance",
    location: "Grand Hotel Ballroom, Yaoundé",
    location_map_url: "",
    event_type: "social",
    starts_at: "2026-04-12T19:00:00",
    ends_at: "2026-04-12T23:00:00",
    is_recurring: false,
    recurrence_rule: null,
    status: "upcoming",
    rsvps: { yes: 41, no: 2, maybe: 4 },
    myRsvp: "yes",
  },
  {
    id: "3",
    title: "Board Meeting",
    title_fr: "Réunion du bureau",
    description: "Executive board quarterly planning session",
    location: "Online (Zoom)",
    location_map_url: "",
    event_type: "meeting",
    starts_at: "2026-04-05T17:00:00",
    ends_at: "2026-04-05T18:30:00",
    is_recurring: true,
    recurrence_rule: "monthly",
    status: "upcoming",
    rsvps: { yes: 8, no: 1, maybe: 0 },
    myRsvp: null,
  },
  {
    id: "4",
    title: "Fundraiser for School Project",
    title_fr: "Collecte pour le projet scolaire",
    description: "Raising funds for the village school renovation",
    location: "Community Center, Bamenda",
    location_map_url: "",
    event_type: "fundraiser",
    starts_at: "2026-04-20T14:00:00",
    ends_at: "2026-04-20T18:00:00",
    is_recurring: false,
    recurrence_rule: null,
    status: "upcoming",
    rsvps: { yes: 25, no: 8, maybe: 12 },
    myRsvp: "maybe",
  },
  {
    id: "5",
    title: "February General Assembly",
    title_fr: "Assemblée générale de février",
    description: "Monthly meeting",
    location: "Community Hall, Douala",
    location_map_url: "",
    event_type: "meeting",
    starts_at: "2026-02-28T18:00:00",
    ends_at: "2026-02-28T20:00:00",
    is_recurring: true,
    recurrence_rule: "monthly",
    status: "completed",
    rsvps: { yes: 38, no: 4, maybe: 5 },
    myRsvp: "yes",
  },
  {
    id: "6",
    title: "Annual General Meeting",
    title_fr: "Assemblée générale annuelle",
    description: "Yearly review, elections, and budget approval",
    location: "Town Hall, Douala",
    location_map_url: "",
    event_type: "agm",
    starts_at: "2026-05-15T09:00:00",
    ends_at: "2026-05-15T17:00:00",
    is_recurring: false,
    recurrence_rule: null,
    status: "upcoming",
    rsvps: { yes: 20, no: 0, maybe: 15 },
    myRsvp: null,
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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function EventsPage() {
  const t = useTranslations();
  const [view, setView] = useState<"calendar" | "list">("list");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<MockEvent | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 2)); // March 2026
  const [isRecurring, setIsRecurring] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = calendarDate.toLocaleDateString("en", { month: "long", year: "numeric" });

  const filteredEvents = mockEvents.filter((e) => {
    if (filter === "upcoming") return e.status === "upcoming";
    if (filter === "past") return e.status === "completed";
    return true;
  });

  const eventsInMonth = mockEvents.filter((e) => {
    const d = new Date(e.starts_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const getEventsForDay = (day: number) => {
    return eventsInMonth.filter((e) => new Date(e.starts_at).getDate() === day);
  };

  const handleRsvp = (eventId: string, response: RsvpResponse) => {
    // Mock RSVP update
    console.log(`RSVP ${response} for event ${eventId}`);
  };

  const handleRepeatLastMeeting = () => {
    const lastMeeting = mockEvents
      .filter((e) => e.event_type === "meeting" && e.status === "completed")
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0];
    if (lastMeeting) {
      setShowCreateDialog(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("events.title")}</h1>
          <p className="text-muted-foreground">{t("events.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRepeatLastMeeting}>
            <Repeat className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t("events.repeatLastMeeting")}</span>
            <span className="sm:hidden">{t("events.repeatLastMeeting").split(" ").slice(0, 2).join(" ")}</span>
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("events.createEvent")}
          </Button>
        </div>
      </div>

      {/* View Toggle + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant={filter === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("upcoming")}
          >
            {t("common.upcoming")}
          </Button>
          <Button
            variant={filter === "past" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("past")}
          >
            {t("common.past")}
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            {t("common.all")}
          </Button>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
          >
            <List className="mr-1 h-4 w-4" />
            {t("events.listView")}
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("calendar")}
          >
            <CalendarDays className="mr-1 h-4 w-4" />
            {t("events.calendarView")}
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
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
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
                const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
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
                      {dayEvents.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${eventTypeColors[event.event_type]}`}
                        >
                          {event.title}
                        </button>
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
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">{t("events.noEvents")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("events.noEventsDesc")}</p>
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("events.createEvent")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredEvents.map((event) => (
              <Card key={event.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Date block */}
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                        <span className="text-xs font-medium text-primary">
                          {new Date(event.starts_at).toLocaleDateString("en", { month: "short" })}
                        </span>
                        <span className="text-xl font-bold leading-none text-primary">
                          {new Date(event.starts_at).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{event.title}</h3>
                          <Badge className={eventTypeColors[event.event_type]} variant="secondary">
                            {t(`events.eventTypes.${event.event_type}`)}
                          </Badge>
                          {event.is_recurring && (
                            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {event.status === "completed" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              {t("common.completed")}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {event.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(event.starts_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                            {event.ends_at && ` - ${new Date(event.ends_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {event.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {t("events.rsvpCount", { count: event.rsvps.yes })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* RSVP buttons */}
                    {event.status === "upcoming" && (
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          size="sm"
                          variant={event.myRsvp === "yes" ? "default" : "outline"}
                          onClick={() => handleRsvp(event.id, "yes")}
                          className="h-8"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {t("events.rsvpYes")}
                        </Button>
                        <Button
                          size="sm"
                          variant={event.myRsvp === "maybe" ? "secondary" : "outline"}
                          onClick={() => handleRsvp(event.id, "maybe")}
                          className="h-8"
                        >
                          <HelpCircle className="mr-1 h-3.5 w-3.5" />
                          {t("events.rsvpMaybe")}
                        </Button>
                        <Button
                          size="sm"
                          variant={event.myRsvp === "no" ? "destructive" : "outline"}
                          onClick={() => handleRsvp(event.id, "no")}
                          className="h-8"
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          {t("events.rsvpNo")}
                        </Button>
                      </div>
                    )}

                    {/* Completed event actions */}
                    {event.status === "completed" && (
                      <div className="flex shrink-0 gap-1.5">
                        <Button size="sm" variant="outline" className="h-8">
                          <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                          {t("events.viewAttendance")}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8">
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          {t("events.viewMinutes")}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedEvent.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={eventTypeColors[selectedEvent.event_type]} variant="secondary">
                  {t(`events.eventTypes.${selectedEvent.event_type}`)}
                </Badge>
                {selectedEvent.is_recurring && (
                  <Badge variant="outline">
                    <Repeat className="mr-1 h-3 w-3" />
                    {selectedEvent.recurrence_rule}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {new Date(selectedEvent.starts_at).toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {new Date(selectedEvent.starts_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                    {selectedEvent.ends_at && ` - ${new Date(selectedEvent.ends_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedEvent.location}</span>
                </div>
              </div>
              <div className="flex gap-4 rounded-lg bg-muted p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">{selectedEvent.rsvps.yes}</div>
                  <div className="text-xs text-muted-foreground">{t("events.rsvpYes")}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-500">{selectedEvent.rsvps.maybe}</div>
                  <div className="text-xs text-muted-foreground">{t("events.rsvpMaybe")}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-destructive">{selectedEvent.rsvps.no}</div>
                  <div className="text-xs text-muted-foreground">{t("events.rsvpNo")}</div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {selectedEvent.status === "upcoming" && (
                <>
                  <Button variant="outline" className="w-full sm:w-auto">
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    {t("events.takeAttendance")}
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto">
                    <FileText className="mr-2 h-4 w-4" />
                    {t("events.writeMinutes")}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("events.createEvent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("events.titleEn")}</Label>
                <Input placeholder="Monthly General Assembly" />
              </div>
              <div className="space-y-2">
                <Label>{t("events.titleFr")}</Label>
                <Input placeholder="Assemblée générale mensuelle" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("events.description")}</Label>
              <Textarea placeholder={t("events.description")} rows={3} />
            </div>

            <div className="space-y-2">
              <Label>{t("events.eventType")}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t("events.selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {(["meeting", "social", "fundraiser", "agm", "emergency", "other"] as EventType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`events.eventTypes.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("events.startDateTime")}</Label>
                <Input type="datetime-local" />
              </div>
              <div className="space-y-2">
                <Label>{t("events.endDateTime")}</Label>
                <Input type="datetime-local" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("events.location")}</Label>
              <Input placeholder="Community Hall, Douala" />
            </div>

            <div className="space-y-2">
              <Label>{t("events.mapsLink")}</Label>
              <Input placeholder={t("events.mapsLinkOptional")} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">{t("events.recurring")}</Label>
                <p className="text-xs text-muted-foreground">{t("events.repeatLastMeetingDesc")}</p>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>

            {isRecurring && (
              <div className="space-y-2">
                <Label>{t("events.recurrenceRule")}</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder={t("events.recurrenceRule")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{t("events.weekly")}</SelectItem>
                    <SelectItem value="biweekly">{t("events.biweekly")}</SelectItem>
                    <SelectItem value="monthly">{t("events.monthly")}</SelectItem>
                    <SelectItem value="custom">{t("events.custom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => setShowCreateDialog(false)}>
              {t("events.saveEvent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
