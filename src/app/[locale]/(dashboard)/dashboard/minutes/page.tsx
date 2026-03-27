"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Search,
  CheckCircle2,
  ListChecks,
  Plus,
  Loader2,
  X,
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Calendar,
  MapPin,
  User,
  Upload,
  Pencil,
  Info,
} from "lucide-react";
import { useMeetingMinutes, useEvents } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventRecord {
  id: string;
  group_id: string;
  title: string;
  title_fr?: string;
  starts_at: string;
  ends_at?: string;
  event_type?: string;
  status?: string;
  location?: string;
}

interface DecisionItem {
  text: string;
  proposed_by: string;
  result: string;
}

interface ActionItem {
  description: string;
  assignee: string;
  deadline: string;
  status: "pending" | "done" | "overdue";
}

interface ContentJson {
  text: string;
  chaired_by: string;
  location: string;
}

interface MinutesRecord {
  id: string;
  event_id: string;
  group_id: string;
  title?: string;
  title_fr?: string;
  content_json: ContentJson;
  decisions_json: DecisionItem[];
  action_items_json: ActionItem[];
  attendees_json: unknown[];
  status: "draft" | "published";
  published_at?: string;
  published_by?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  event?: EventRecord;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MinutesPage() {
  const t = useTranslations("minutes");
  const tc = useTranslations("common");
  const { groupId, user } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("minutes.manage");
  const queryClient = useQueryClient();
  const supabase = createClient();

  const {
    data: minutesRaw,
    isLoading: minutesLoading,
    isError: minutesError,
    error: minutesErr,
    refetch: refetchMinutes,
  } = useMeetingMinutes();
  const {
    data: eventsRaw,
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
    refetch: refetchEvents,
  } = useEvents();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionTrackerFilter, setActionTrackerFilter] = useState<
    "all" | "pending" | "done" | "overdue"
  >("all");

  // Editor state
  const [editorTab, setEditorTab] = useState<"rich" | "plain" | "upload">(
    "rich"
  );
  const [editorLocation, setEditorLocation] = useState("");
  const [editorChairedBy, setEditorChairedBy] = useState("");
  const [editorPlainText, setEditorPlainText] = useState("");
  const [editorDecisions, setEditorDecisions] = useState<DecisionItem[]>([]);
  const [editorActionItems, setEditorActionItems] = useState<ActionItem[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [richTextInitContent, setRichTextInitContent] = useState("");
  const contentEditableRef = useRef<HTMLDivElement>(null);

  const events = (eventsRaw || []) as EventRecord[];
  const minutes = (minutesRaw || []) as MinutesRecord[];

  // Build a map of event_id -> minutes record
  const minutesByEventId = useMemo(() => {
    const map: Record<string, MinutesRecord> = {};
    for (const m of minutes) {
      map[m.event_id] = m;
    }
    return map;
  }, [minutes]);

  // Filter events for the left panel
  const filteredEvents = useMemo(() => {
    let list = events;

    // Non-admins only see events with published minutes
    if (!isAdmin) {
      list = list.filter((e) => {
        const m = minutesByEventId[e.id];
        return m && m.status === "published";
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.title_fr && e.title_fr.toLowerCase().includes(q))
      );
    }

    return list;
  }, [events, isAdmin, minutesByEventId, searchQuery]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;
  const selectedMinutes = selectedEventId
    ? minutesByEventId[selectedEventId] || null
    : null;

  // Set rich text content via textContent when initializing editor
  useEffect(() => {
    if (editMode && contentEditableRef.current && richTextInitContent) {
      contentEditableRef.current.textContent = richTextInitContent;
    }
  }, [editMode, richTextInitContent]);

  // ─── Editor initialization ──────────────────────────────────────────────

  const initEditor = useCallback(
    (minutesData: MinutesRecord | null, event: EventRecord | null) => {
      if (minutesData) {
        const content = minutesData.content_json || ({} as ContentJson);
        setEditorLocation(content.location || event?.location || "");
        setEditorChairedBy(content.chaired_by || "");
        setEditorPlainText(content.text || "");
        setRichTextInitContent(content.text || "");
        setEditorDecisions(minutesData.decisions_json || []);
        setEditorActionItems(minutesData.action_items_json || []);
      } else {
        const template = t("templateHint");
        setEditorLocation(event?.location || "");
        setEditorChairedBy("");
        setEditorPlainText(template);
        setRichTextInitContent(template);
        setEditorDecisions([]);
        setEditorActionItems([]);
      }
      setUploadedFileName(null);
      setEditorTab("rich");
    },
    [t]
  );

  const handleSelectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setEditMode(false);
  };

  const handleStartEdit = () => {
    initEditor(selectedMinutes, selectedEvent);
    setEditMode(true);
  };

  const handleStartCreate = () => {
    initEditor(null, selectedEvent);
    setEditMode(true);
  };

  // ─── Formatting commands ────────────────────────────────────────────────

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    contentEditableRef.current?.focus();
  };

  // ─── Save / Publish ─────────────────────────────────────────────────────

  const handleSave = async (status: "draft" | "published") => {
    if (!selectedEvent || !groupId || !user) return;
    setSaving(true);

    const textContent =
      editorTab === "rich"
        ? contentEditableRef.current?.innerText || ""
        : editorPlainText;

    const payload: Record<string, unknown> = {
      event_id: selectedEvent.id,
      group_id: groupId,
      title: selectedEvent.title,
      title_fr: selectedEvent.title_fr || null,
      content_json: {
        text: textContent,
        chaired_by: editorChairedBy,
        location: editorLocation,
      },
      decisions_json: editorDecisions,
      action_items_json: editorActionItems,
      status,
      created_by: user.id,
    };

    if (status === "published") {
      payload.published_at = new Date().toISOString();
      payload.published_by = user.id;
    }

    try {
      const { error } = await supabase
        .from("meeting_minutes")
        .upsert(payload, { onConflict: "event_id" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["meeting-minutes", groupId] });
      setEditMode(false);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Action item status toggle (admin) ──────────────────────────────────

  const handleToggleActionStatus = async (
    minutesRecord: MinutesRecord,
    actionIndex: number
  ) => {
    if (!isAdmin || !groupId) return;
    const items = [...(minutesRecord.action_items_json || [])];
    const current = items[actionIndex];
    if (!current) return;
    items[actionIndex] = {
      ...current,
      status: current.status === "done" ? "pending" : "done",
    };

    try {
      const { error } = await supabase
        .from("meeting_minutes")
        .update({ action_items_json: items })
        .eq("id", minutesRecord.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["meeting-minutes", groupId] });
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  // ─── Decisions / Action Items editor helpers ────────────────────────────

  const addDecision = () =>
    setEditorDecisions((prev) => [
      ...prev,
      { text: "", proposed_by: "", result: "" },
    ]);
  const removeDecision = (i: number) =>
    setEditorDecisions((prev) => prev.filter((_, idx) => idx !== i));
  const updateDecision = (i: number, field: keyof DecisionItem, val: string) =>
    setEditorDecisions((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, [field]: val } : d))
    );

  const addActionItem = () =>
    setEditorActionItems((prev) => [
      ...prev,
      { description: "", assignee: "", deadline: "", status: "pending" },
    ]);
  const removeActionItem = (i: number) =>
    setEditorActionItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateActionItem = (
    i: number,
    field: keyof ActionItem,
    val: string
  ) =>
    setEditorActionItems((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, [field]: val } : a))
    );

  // ─── Collect all action items for tracker ───────────────────────────────

  const allActionItems = useMemo(() => {
    const items: {
      item: ActionItem;
      meetingTitle: string;
      minutesRecord: MinutesRecord;
      index: number;
    }[] = [];
    for (const m of minutes) {
      if (m.status !== "published") continue;
      const actions = m.action_items_json || [];
      actions.forEach((a, idx) => {
        items.push({
          item: a,
          meetingTitle: m.title || m.event?.title || "",
          minutesRecord: m,
          index: idx,
        });
      });
    }
    return items;
  }, [minutes]);

  const filteredActionItems = useMemo(() => {
    if (actionTrackerFilter === "all") return allActionItems;
    return allActionItems.filter((a) => a.item.status === actionTrackerFilter);
  }, [allActionItems, actionTrackerFilter]);

  // ─── Loading / Error states ─────────────────────────────────────────────

  if (minutesLoading || eventsLoading) {
    return <ListSkeleton rows={5} />;
  }

  if (minutesError || eventsError) {
    return (
      <ErrorState
        message={
          (minutesErr as Error)?.message || (eventsErr as Error)?.message
        }
        onRetry={() => {
          refetchMinutes();
          refetchEvents();
        }}
      />
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={FileText}
          title={t("noMinutes")}
          description={t("createEventFirst")}
        />
      </div>
    );
  }

  // ─── Status badge helper ────────────────────────────────────────────────

  const getStatusBadge = (eventId: string) => {
    const m = minutesByEventId[eventId];
    if (!m) return null;
    if (m.status === "published")
      return (
        <Badge
          variant="default"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {tc("published")}
        </Badge>
      );
    if (m.status === "draft")
      return (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        >
          {tc("draft")}
        </Badge>
      );
    return null;
  };

  const actionStatusColor = (s: string) => {
    if (s === "done") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (s === "overdue") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Read-only notice for members */}
      {!isAdmin && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-800 dark:text-blue-300">
            {t("readOnlyNotice")}
          </p>
        </div>
      )}

      {/* Two-column split panel */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* LEFT COLUMN: Event list */}
        <div className="w-full space-y-4 lg:w-1/3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchMinutes")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Event list */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {tc("noResults")}
              </p>
            ) : (
              filteredEvents.map((event) => (
                <Card
                  key={event.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    selectedEventId === event.id &&
                      "border-primary ring-1 ring-primary"
                  )}
                  onClick={() => handleSelectEvent(event.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">
                          {event.title}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(event.starts_at)}</span>
                        </div>
                        {event.event_type && (
                          <Badge
                            variant="outline"
                            className="mt-1.5 text-xs"
                          >
                            {event.event_type}
                          </Badge>
                        )}
                      </div>
                      {getStatusBadge(event.id)}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Minutes view/editor */}
        <div className="w-full lg:w-2/3">
          {!selectedEvent ? (
            /* No event selected */
            <Card className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">{t("selectEvent")}</p>
              </div>
            </Card>
          ) : editMode && isAdmin ? (
            /* Editor mode */
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5" />
                  {selectedMinutes
                    ? t("editMinutes")
                    : t("createMinutes")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Meeting Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">
                    {t("meetingDetails")}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {tc("date")}
                      </Label>
                      <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                        {formatDateTime(selectedEvent.starts_at)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {t("location")}
                      </Label>
                      <Input
                        value={editorLocation}
                        onChange={(e) => setEditorLocation(e.target.value)}
                        placeholder={t("location")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        {t("chairedBy")}
                      </Label>
                      <Input
                        value={editorChairedBy}
                        onChange={(e) => setEditorChairedBy(e.target.value)}
                        placeholder={t("chairedBy")}
                      />
                    </div>
                  </div>
                </div>

                {/* Content Tabs */}
                <div className="space-y-3">
                  <Tabs
                    value={editorTab}
                    onValueChange={(v) =>
                      setEditorTab(v as "rich" | "plain" | "upload")
                    }
                  >
                    <TabsList>
                      <TabsTrigger value="rich">{t("richText")}</TabsTrigger>
                      <TabsTrigger value="plain">
                        {t("plainText")}
                      </TabsTrigger>
                      <TabsTrigger value="upload">
                        {t("uploadFile")}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="rich" className="space-y-2">
                      {/* Toolbar */}
                      <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => execCommand("bold")}
                        >
                          <Bold className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => execCommand("italic")}
                        >
                          <Italic className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => execCommand("underline")}
                        >
                          <Underline className="h-4 w-4" />
                        </Button>
                        <div className="mx-1 w-px bg-border" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs font-bold"
                          onClick={() =>
                            execCommand("formatBlock", "<h2>")
                          }
                        >
                          <Heading2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs font-bold"
                          onClick={() =>
                            execCommand("formatBlock", "<h3>")
                          }
                        >
                          <Heading3 className="h-4 w-4" />
                        </Button>
                        <div className="mx-1 w-px bg-border" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            execCommand("insertUnorderedList")
                          }
                        >
                          <List className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            execCommand("insertOrderedList")
                          }
                        >
                          <ListOrdered className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* ContentEditable div - uses textContent set via useEffect */}
                      <div
                        ref={contentEditableRef}
                        contentEditable
                        suppressContentEditableWarning
                        className="min-h-[300px] rounded-md border bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        onBlur={() => {
                          if (contentEditableRef.current) {
                            setEditorPlainText(
                              contentEditableRef.current.innerText
                            );
                          }
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="plain">
                      <Textarea
                        value={editorPlainText}
                        onChange={(e) => setEditorPlainText(e.target.value)}
                        rows={15}
                        className="font-mono text-sm"
                        placeholder={t("templateHint")}
                      />
                    </TabsContent>

                    <TabsContent value="upload" className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Label
                          htmlFor="file-upload"
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                        >
                          <Upload className="h-5 w-5" />
                          {t("uploadFile")}
                        </Label>
                        <input
                          id="file-upload"
                          type="file"
                          accept=".pdf,.docx,.jpg,.png"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setUploadedFileName(file.name);
                          }}
                        />
                      </div>
                      {uploadedFileName && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{uploadedFileName}</span>
                          <Badge variant="secondary">{t("uploaded")}</Badge>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("uploadNote")}
                      </p>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Decisions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{t("decisions")}</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDecision}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("addDecision")}
                    </Button>
                  </div>
                  {editorDecisions.map((d, i) => (
                    <div
                      key={i}
                      className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                    >
                      <Input
                        placeholder={t("decisionText")}
                        value={d.text}
                        onChange={(e) =>
                          updateDecision(i, "text", e.target.value)
                        }
                      />
                      <Input
                        placeholder={t("proposedBy")}
                        value={d.proposed_by}
                        onChange={(e) =>
                          updateDecision(i, "proposed_by", e.target.value)
                        }
                        className="sm:w-36"
                      />
                      <Input
                        placeholder={t("result")}
                        value={d.result}
                        onChange={(e) =>
                          updateDecision(i, "result", e.target.value)
                        }
                        className="sm:w-32"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeDecision(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Action Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t("actionItems")}
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addActionItem}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("addActionItem")}
                    </Button>
                  </div>
                  {editorActionItems.map((a, i) => (
                    <div
                      key={i}
                      className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
                    >
                      <Input
                        placeholder={t("actionDescription")}
                        value={a.description}
                        onChange={(e) =>
                          updateActionItem(i, "description", e.target.value)
                        }
                      />
                      <Input
                        placeholder={t("assignedTo")}
                        value={a.assignee}
                        onChange={(e) =>
                          updateActionItem(i, "assignee", e.target.value)
                        }
                        className="sm:w-32"
                      />
                      <Input
                        type="date"
                        value={a.deadline}
                        onChange={(e) =>
                          updateActionItem(i, "deadline", e.target.value)
                        }
                        className="sm:w-36"
                      />
                      <Select
                        value={a.status}
                        onValueChange={(v) =>
                          updateActionItem(i, "status", v ?? "pending")
                        }
                      >
                        <SelectTrigger className="sm:w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">
                            {t("statusPending")}
                          </SelectItem>
                          <SelectItem value="done">
                            {t("statusDone")}
                          </SelectItem>
                          <SelectItem value="overdue">
                            {t("statusOverdue")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeActionItem(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setEditMode(false)}
                    disabled={saving}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleSave("draft")}
                    disabled={saving}
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("saveDraft")}
                  </Button>
                  <Button
                    onClick={() => handleSave("published")}
                    disabled={saving}
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("publishMinutes")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : selectedMinutes ? (
            /* View mode */
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {selectedMinutes.title || selectedEvent.title}
                      <Badge
                        variant="default"
                        className={cn(
                          selectedMinutes.status === "published"
                            ? "bg-emerald-600 text-white"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        )}
                      >
                        {selectedMinutes.status === "published"
                          ? tc("published")
                          : tc("draft")}
                      </Badge>
                    </CardTitle>
                    {selectedMinutes.published_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("publishedOn", {
                          date: formatDate(selectedMinutes.published_at),
                        })}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartEdit}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {tc("edit")}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Meeting details */}
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDateTime(selectedEvent.starts_at)}</span>
                  </div>
                  {(selectedMinutes.content_json?.location ||
                    selectedEvent.location) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {selectedMinutes.content_json?.location ||
                          selectedEvent.location}
                      </span>
                    </div>
                  )}
                  {selectedMinutes.content_json?.chaired_by && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {t("chairedBy")}:{" "}
                        {selectedMinutes.content_json.chaired_by}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content text */}
                {selectedMinutes.content_json?.text && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4" />
                      {t("discussionSummary")}
                    </h3>
                    <div className="whitespace-pre-wrap rounded-lg border bg-muted/10 p-4 text-sm">
                      {selectedMinutes.content_json.text}
                    </div>
                  </div>
                )}

                {/* Decisions */}
                {selectedMinutes.decisions_json &&
                  selectedMinutes.decisions_json.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {t("decisions")}
                      </h3>
                      <div className="space-y-2">
                        {selectedMinutes.decisions_json.map(
                          (decision, i) => (
                            <div
                              key={i}
                              className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
                            >
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                {i + 1}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {decision.text}
                                </p>
                                {(decision.proposed_by ||
                                  decision.result) && (
                                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                                    {decision.proposed_by && (
                                      <span>
                                        {t("proposedBy")}:{" "}
                                        {decision.proposed_by}
                                      </span>
                                    )}
                                    {decision.result && (
                                      <span>
                                        {t("result")}: {decision.result}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* Action Items */}
                {selectedMinutes.action_items_json &&
                  selectedMinutes.action_items_json.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <ListChecks className="h-4 w-4" />
                        {t("actionItems")}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="pb-2 pr-4 font-medium">
                                {t("actionDescription")}
                              </th>
                              <th className="pb-2 pr-4 font-medium">
                                {t("assignedTo")}
                              </th>
                              <th className="pb-2 pr-4 font-medium">
                                {t("deadline")}
                              </th>
                              <th className="pb-2 font-medium">
                                {t("actionStatus")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedMinutes.action_items_json.map(
                              (item, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2 pr-4">
                                    {item.description}
                                  </td>
                                  <td className="py-2 pr-4">
                                    {item.assignee}
                                  </td>
                                  <td className="py-2 pr-4">
                                    {item.deadline
                                      ? formatDate(item.deadline)
                                      : "\u2014"}
                                  </td>
                                  <td className="py-2">
                                    <Badge
                                      variant="secondary"
                                      className={actionStatusColor(
                                        item.status
                                      )}
                                    >
                                      {item.status === "done"
                                        ? t("statusDone")
                                        : item.status === "overdue"
                                          ? t("statusOverdue")
                                          : t("statusPending")}
                                    </Badge>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          ) : isAdmin ? (
            /* No minutes exist for this event - admin can create */
            <Card className="flex min-h-[300px] flex-col items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="mb-4 text-muted-foreground">
                  {t("noMinutesYet")}
                </p>
                <Button onClick={handleStartCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("createMinutes")}
                </Button>
              </div>
            </Card>
          ) : (
            /* No published minutes for member */
            <Card className="flex min-h-[300px] items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  {t("noPublishedMinutes")}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Action Items Tracker */}
      {allActionItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="h-5 w-5" />
                {t("actionItemsTracker")}
              </CardTitle>
              <div className="flex gap-1.5">
                {(
                  ["all", "pending", "done", "overdue"] as const
                ).map((f) => (
                  <Button
                    key={f}
                    variant={actionTrackerFilter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActionTrackerFilter(f)}
                  >
                    {f === "all"
                      ? tc("all")
                      : f === "pending"
                        ? t("statusPending")
                        : f === "done"
                          ? t("statusDone")
                          : t("statusOverdue")}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">
                      {t("actionDescription")}
                    </th>
                    <th className="pb-2 pr-4 font-medium">
                      {t("fromMeeting")}
                    </th>
                    <th className="pb-2 pr-4 font-medium">
                      {t("assignedTo")}
                    </th>
                    <th className="pb-2 pr-4 font-medium">
                      {t("deadline")}
                    </th>
                    <th className="pb-2 font-medium">{t("actionStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActionItems.map((entry, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{entry.item.description}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {entry.meetingTitle}
                      </td>
                      <td className="py-2 pr-4">{entry.item.assignee}</td>
                      <td className="py-2 pr-4">
                        {entry.item.deadline
                          ? formatDate(entry.item.deadline)
                          : "\u2014"}
                      </td>
                      <td className="py-2">
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() =>
                              handleToggleActionStatus(
                                entry.minutesRecord,
                                entry.index
                              )
                            }
                          >
                            <Badge
                              variant="secondary"
                              className={cn(
                                "cursor-pointer",
                                actionStatusColor(entry.item.status)
                              )}
                            >
                              {entry.item.status === "done"
                                ? t("statusDone")
                                : entry.item.status === "overdue"
                                  ? t("statusOverdue")
                                  : t("statusPending")}
                            </Badge>
                          </Button>
                        ) : (
                          <Badge
                            variant="secondary"
                            className={actionStatusColor(entry.item.status)}
                          >
                            {entry.item.status === "done"
                              ? t("statusDone")
                              : entry.item.status === "overdue"
                                ? t("statusOverdue")
                                : t("statusPending")}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredActionItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {tc("noResults")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
