"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  FileText,
  Plus,
  Search,
  Send,
  Save,
  CheckCircle2,
  ListChecks,
  Users,
  Calendar,
  Trash2,
  MessageSquare,
  BookOpen,
  Filter,
  Download,
  Share2,
  Bell,
  Eye,
  Edit3,
} from "lucide-react";

interface Decision {
  id: string;
  number: number;
  text: string;
}

interface ActionItem {
  id: string;
  text: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
}

interface Minutes {
  id: string;
  eventTitle: string;
  eventDate: string;
  status: "draft" | "published";
  publishedAt?: string;
  publishedBy?: string;
  discussionSummary: string;
  decisions: Decision[];
  actionItems: ActionItem[];
  attendeesCount: number;
}

const mockMinutesList: Minutes[] = [
  {
    id: "1",
    eventTitle: "February General Assembly",
    eventDate: "2026-02-28",
    status: "published",
    publishedAt: "2026-03-01",
    publishedBy: "Sylvie Mbarga",
    discussionSummary: "Discussed the school project budget allocation, reviewed Q1 financials, and planned the upcoming cultural gala. The treasurer presented the quarterly report showing 82% collection rate.",
    decisions: [
      { id: "d1", number: 1, text: "Allocate 500,000 XAF for the village school renovation project" },
      { id: "d2", number: 2, text: "Increase monthly dues by 2,000 XAF starting April 2026" },
      { id: "d3", number: 3, text: "Form a 5-person committee for the Cultural Gala planning" },
    ],
    actionItems: [
      { id: "a1", text: "Get contractor quotes for school renovation", assignee: "Emmanuel Tabi", dueDate: "2026-03-15", completed: true },
      { id: "a2", text: "Send updated dues notice to all members", assignee: "Jean-Pierre Kamga", dueDate: "2026-03-10", completed: true },
      { id: "a3", text: "Book venue for Cultural Gala", assignee: "Marie-Claire Fotso", dueDate: "2026-03-20", completed: false },
    ],
    attendeesCount: 38,
  },
  {
    id: "2",
    eventTitle: "January General Assembly",
    eventDate: "2026-01-28",
    status: "published",
    publishedAt: "2026-01-30",
    publishedBy: "Sylvie Mbarga",
    discussionSummary: "Year-opening meeting. Set annual goals, elected new board positions, and reviewed 2025 annual financial report.",
    decisions: [
      { id: "d4", number: 1, text: "Approve 2025 annual financial report as presented by treasurer" },
      { id: "d5", number: 2, text: "Set 2026 annual goal: fund school renovation and host cultural gala" },
    ],
    actionItems: [
      { id: "a4", text: "Draft 2026 budget proposal", assignee: "Paul Ngoumou", dueDate: "2026-02-15", completed: true },
    ],
    attendeesCount: 35,
  },
  {
    id: "3",
    eventTitle: "March General Assembly",
    eventDate: "2026-03-28",
    status: "draft",
    discussionSummary: "",
    decisions: [],
    actionItems: [],
    attendeesCount: 0,
  },
];

const mockAttendees = [
  { name: "Jean-Pierre Kamga", initials: "JK" },
  { name: "Sylvie Mbarga", initials: "SM" },
  { name: "Emmanuel Tabi", initials: "ET" },
  { name: "Marie-Claire Fotso", initials: "MF" },
  { name: "Paul Ngoumou", initials: "PN" },
  { name: "Georges Tchinda", initials: "GT" },
  { name: "Hélène Njike", initials: "HN" },
  { name: "François Mbassi", initials: "FM" },
];

const mockMeetingEvents = [
  { id: "e1", title: "March General Assembly", date: "2026-03-28" },
  { id: "e2", title: "Board Meeting", date: "2026-04-05" },
];

export default function MinutesPage() {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [selectedMinutes, setSelectedMinutes] = useState<Minutes | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showDecisionIndex, setShowDecisionIndex] = useState(false);

  // Editor state
  const [editorSummary, setEditorSummary] = useState("");
  const [editorDecisions, setEditorDecisions] = useState<Decision[]>([]);
  const [editorActionItems, setEditorActionItems] = useState<ActionItem[]>([]);

  const filteredMinutes = mockMinutesList.filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.eventTitle.toLowerCase().includes(q) ||
        m.discussionSummary.toLowerCase().includes(q) ||
        m.decisions.some((d) => d.text.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const allDecisions = mockMinutesList
    .filter((m) => m.status === "published")
    .flatMap((m) =>
      m.decisions.map((d) => ({
        ...d,
        eventTitle: m.eventTitle,
        eventDate: m.eventDate,
      }))
    );

  const openEditor = (minutes?: Minutes) => {
    if (minutes) {
      setEditorSummary(minutes.discussionSummary);
      setEditorDecisions([...minutes.decisions]);
      setEditorActionItems([...minutes.actionItems]);
    } else {
      setEditorSummary("");
      setEditorDecisions([]);
      setEditorActionItems([]);
    }
    setShowEditor(true);
  };

  const addDecision = () => {
    setEditorDecisions([
      ...editorDecisions,
      { id: `new-${Date.now()}`, number: editorDecisions.length + 1, text: "" },
    ]);
  };

  const addActionItem = () => {
    setEditorActionItems([
      ...editorActionItems,
      { id: `new-${Date.now()}`, text: "", assignee: "", dueDate: "", completed: false },
    ]);
  };

  const removeDecision = (id: string) => {
    setEditorDecisions(editorDecisions.filter((d) => d.id !== id).map((d, i) => ({ ...d, number: i + 1 })));
  };

  const removeActionItem = (id: string) => {
    setEditorActionItems(editorActionItems.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("minutes.title")}</h1>
          <p className="text-muted-foreground">{t("minutes.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowDecisionIndex(true)}>
            <ListChecks className="mr-2 h-4 w-4" />
            {t("minutes.decisionIndex")}
          </Button>
          <Button onClick={() => openEditor()}>
            <Plus className="mr-2 h-4 w-4" />
            {t("minutes.createMinutes")}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("minutes.searchMinutes")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            {t("common.all")}
          </Button>
          <Button
            variant={statusFilter === "draft" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("draft")}
          >
            {t("common.draft")}
          </Button>
          <Button
            variant={statusFilter === "published" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("published")}
          >
            {t("common.published")}
          </Button>
        </div>
      </div>

      {/* Minutes List */}
      <div className="space-y-3">
        {filteredMinutes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">{t("minutes.noMinutes")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("minutes.noMinutesDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          filteredMinutes.map((minutes) => (
            <Card key={minutes.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                      <span className="text-xs font-medium text-primary">
                        {new Date(minutes.eventDate).toLocaleDateString("en", { month: "short" })}
                      </span>
                      <span className="text-lg font-bold leading-none text-primary">
                        {new Date(minutes.eventDate).getDate()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{minutes.eventTitle}</h3>
                        <Badge variant={minutes.status === "published" ? "default" : "secondary"}>
                          {minutes.status === "published" ? t("common.published") : t("common.draft")}
                        </Badge>
                      </div>
                      {minutes.status === "published" && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("minutes.publishedOn", { date: minutes.publishedAt ?? "" })} · {t("minutes.publishedBy", { name: minutes.publishedBy ?? "" })}
                        </p>
                      )}
                      {minutes.discussionSummary && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {minutes.discussionSummary}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {minutes.decisions.length > 0 && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                            {t("dashboard.decisionsCount", { count: minutes.decisions.length })}
                          </span>
                        )}
                        {minutes.actionItems.length > 0 && (
                          <span className="flex items-center gap-1">
                            <ListChecks className="h-3.5 w-3.5 text-primary" />
                            {t("dashboard.actionItemsCount", { count: minutes.actionItems.length })}
                          </span>
                        )}
                        {minutes.attendeesCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {minutes.attendeesCount} {t("events.attendees").toLowerCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {minutes.status === "draft" ? (
                      <Button size="sm" variant="outline" onClick={() => openEditor(minutes)}>
                        <Edit3 className="mr-1 h-3.5 w-3.5" />
                        {t("common.edit")}
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setSelectedMinutes(minutes)}>
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          {t("common.viewAll")}
                        </Button>
                        <Button size="sm" variant="ghost">
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* View Minutes Dialog */}
      {selectedMinutes && (
        <Dialog open={!!selectedMinutes} onOpenChange={() => setSelectedMinutes(null)}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("minutes.minutesFor", { event: selectedMinutes.eventTitle })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Attendees */}
              <div>
                <h4 className="flex items-center gap-2 font-semibold text-sm">
                  <Users className="h-4 w-4" />
                  {t("minutes.attendeesList")} ({selectedMinutes.attendeesCount})
                </h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mockAttendees.map((a) => (
                    <Badge key={a.name} variant="outline" className="text-xs">
                      {a.name}
                    </Badge>
                  ))}
                  {selectedMinutes.attendeesCount > mockAttendees.length && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      +{selectedMinutes.attendeesCount - mockAttendees.length}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Discussion Summary */}
              <div>
                <h4 className="flex items-center gap-2 font-semibold text-sm">
                  <MessageSquare className="h-4 w-4" />
                  {t("minutes.discussionSummary")}
                </h4>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {selectedMinutes.discussionSummary}
                </p>
              </div>

              {/* Decisions */}
              {selectedMinutes.decisions.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 font-semibold text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {t("minutes.decisions")}
                  </h4>
                  <div className="mt-2 space-y-2">
                    {selectedMinutes.decisions.map((decision) => (
                      <div key={decision.id} className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {decision.number}
                        </div>
                        <p className="text-sm">{decision.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {selectedMinutes.actionItems.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 font-semibold text-sm">
                    <ListChecks className="h-4 w-4" />
                    {t("minutes.actionItems")}
                  </h4>
                  <div className="mt-2 space-y-2">
                    {selectedMinutes.actionItems.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                        <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                          item.completed ? "border-primary bg-primary" : "border-muted-foreground/30"
                        }`}>
                          {item.completed && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                            {item.text}
                          </p>
                          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                            <span>{item.assignee}</span>
                            <span>·</span>
                            <span>{t("common.dueDate")}: {item.dueDate}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                {t("minutes.downloadPDF")}
              </Button>
              <Button variant="outline">
                <Share2 className="mr-2 h-4 w-4" />
                {t("minutes.shareWhatsApp")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("minutes.editMinutes")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Select Meeting */}
            <div className="space-y-2">
              <Label>{t("minutes.selectEvent")}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t("minutes.selectEvent")} />
                </SelectTrigger>
                <SelectContent>
                  {mockMeetingEvents.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} — {event.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Attendees */}
            <div>
              <Label>{t("minutes.attendeesList")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t("minutes.autoPopulated")}</p>
              <div className="flex flex-wrap gap-1.5">
                {mockAttendees.map((a) => (
                  <Badge key={a.name} variant="outline" className="text-xs">
                    {a.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Discussion Summary */}
            <div className="space-y-2">
              <Label>{t("minutes.discussionSummary")}</Label>
              <Textarea
                placeholder={t("minutes.discussionPlaceholder")}
                rows={5}
                value={editorSummary}
                onChange={(e) => setEditorSummary(e.target.value)}
              />
            </div>

            {/* Decisions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("minutes.decisions")}</Label>
                <Button size="sm" variant="outline" onClick={addDecision}>
                  <Plus className="mr-1 h-3 w-3" />
                  {t("minutes.addDecision")}
                </Button>
              </div>
              {editorDecisions.map((decision) => (
                <div key={decision.id} className="flex gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground mt-1">
                    {decision.number}
                  </div>
                  <Input
                    placeholder={t("minutes.decisionText")}
                    value={decision.text}
                    onChange={(e) =>
                      setEditorDecisions(
                        editorDecisions.map((d) =>
                          d.id === decision.id ? { ...d, text: e.target.value } : d
                        )
                      )
                    }
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-destructive"
                    onClick={() => removeDecision(decision.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Action Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("minutes.actionItems")}</Label>
                <Button size="sm" variant="outline" onClick={addActionItem}>
                  <Plus className="mr-1 h-3 w-3" />
                  {t("minutes.addActionItem")}
                </Button>
              </div>
              {editorActionItems.map((item) => (
                <div key={item.id} className="space-y-2 rounded-lg border p-3">
                  <Input
                    placeholder={t("minutes.actionItemText")}
                    value={item.text}
                    onChange={(e) =>
                      setEditorActionItems(
                        editorActionItems.map((a) =>
                          a.id === item.id ? { ...a, text: e.target.value } : a
                        )
                      )
                    }
                  />
                  <div className="flex gap-2">
                    <Select
                      value={item.assignee}
                      onValueChange={(value) =>
                        setEditorActionItems(
                          editorActionItems.map((a) =>
                            a.id === item.id ? { ...a, assignee: value ?? "" } : a
                          )
                        )
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={t("minutes.selectMember")} />
                      </SelectTrigger>
                      <SelectContent>
                        {mockAttendees.map((m) => (
                          <SelectItem key={m.name} value={m.name}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={item.dueDate}
                      onChange={(e) =>
                        setEditorActionItems(
                          editorActionItems.map((a) =>
                            a.id === item.id ? { ...a, dueDate: e.target.value } : a
                          )
                        )
                      }
                      className="w-40"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() => removeActionItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              <Save className="mr-2 h-4 w-4" />
              {t("minutes.saveDraft")}
            </Button>
            <Button onClick={() => setShowEditor(false)}>
              <Send className="mr-2 h-4 w-4" />
              {t("minutes.publishMinutes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Index Dialog */}
      <Dialog open={showDecisionIndex} onOpenChange={setShowDecisionIndex}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("minutes.decisionIndex")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("minutes.searchByDecision")} className="pl-9" />
            </div>
            {allDecisions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("minutes.noDecisions")}</p>
            ) : (
              allDecisions.map((decision) => (
                <div key={decision.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {decision.number}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{decision.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {decision.eventTitle} · {decision.eventDate}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
