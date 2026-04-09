"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  AlertCircle,
  Trash2,
  ExternalLink,
  ArrowUpDown,
  Ban,
} from "lucide-react";
import { useMeetingMinutes, useEvents, useMembers } from "@/lib/hooks/use-supabase-query";
import { getMemberName } from "@/lib/get-member-name";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { getEnabledChannels } from "@/lib/notification-prefs";
import { useQueryClient } from "@tanstack/react-query";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { cn, normalizeSearch } from "@/lib/utils";

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
  meeting_link?: string;
  is_recurring?: boolean;
  recurrence_rule?: string;
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
  file_url?: string | null;
  event?: EventRecord;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
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

function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MinutesPage() {
  const locale = useLocale();
  const t = useTranslations("minutes");
  const tc = useTranslations("common");
  const { groupId, user, currentGroup } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const formatDate = (dateStr: string) => formatDateWithGroupFormat(dateStr, groupDateFormat, locale);
  const { hasPermission } = usePermissions();
  const canManageMinutes = hasPermission("minutes.manage");
  const queryClient = useQueryClient();
  const supabase = createClient();

  const {
    data: minutesRaw,
    isLoading: minutesLoading,
    isError: minutesError,
    error: minutesErr,
    refetch: refetchMinutes,
  } = useMeetingMinutes();
  const { data: members } = useMembers();
  const {
    data: eventsRaw,
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
    refetch: refetchEvents,
  } = useEvents();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"date" | "title">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [cancellingMeeting, setCancellingMeeting] = useState(false);

  // Action notifications
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  function showError(msg: string) {
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  }
  function showSuccess(msg: string) {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  }
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [standaloneTitle, setStandaloneTitle] = useState("");
  const [selectedStandaloneId, setSelectedStandaloneId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionTrackerFilter, setActionTrackerFilter] = useState<
    "all" | "pending" | "done" | "overdue"
  >("all");

  // Editor state
  const [editorTab, setEditorTab] = useState<"rich" | "template" | "plain" | "upload">(
    "rich"
  );
  const [editorLocation, setEditorLocation] = useState("");
  const [editorChairedBy, setEditorChairedBy] = useState("");
  const [editorPlainText, setEditorPlainText] = useState("");
  const [editorDecisions, setEditorDecisions] = useState<DecisionItem[]>([]);
  const [editorActionItems, setEditorActionItems] = useState<ActionItem[]>([]);
  const [editorAttendees, setEditorAttendees] = useState<string[]>([]); // membership IDs
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Delete state
  const [deleteMinutesId, setDeleteMinutesId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
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
    if (!canManageMinutes) {
      list = list.filter((e) => {
        const m = minutesByEventId[e.id];
        return m && m.status === "published";
      });
    }

    // Search filter (accent-insensitive) — searches event title + minutes content
    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery);
      list = list.filter((e) => {
        if (normalizeSearch(e.title).includes(q)) return true;
        if (e.title_fr && normalizeSearch(e.title_fr).includes(q)) return true;
        // Also search inside the linked minutes content
        const m = minutesByEventId[e.id];
        if (m) {
          if (m.title && normalizeSearch(m.title).includes(q)) return true;
          if (m.content_json?.text && normalizeSearch(m.content_json.text).includes(q)) return true;
          if (m.content_json?.chaired_by && normalizeSearch(m.content_json.chaired_by).includes(q)) return true;
        }
        return false;
      });
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortField === "date") {
        const da = new Date(a.starts_at).getTime();
        const db = new Date(b.starts_at).getTime();
        return sortDir === "desc" ? db - da : da - db;
      }
      const ta = (locale === "fr" && a.title_fr ? a.title_fr : a.title).toLowerCase();
      const tb = (locale === "fr" && b.title_fr ? b.title_fr : b.title).toLowerCase();
      return sortDir === "desc" ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });

    return list;
  }, [events, canManageMinutes, minutesByEventId, searchQuery, sortField, sortDir, locale]);

  // Standalone minutes (no event_id) — also filtered by search
  const standaloneMinutes = useMemo(() => {
    let list = minutes.filter((m) => !m.event_id);
    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery);
      list = list.filter((m) => {
        if (m.title && normalizeSearch(m.title).includes(q)) return true;
        if (m.content_json?.text && normalizeSearch(m.content_json.text).includes(q)) return true;
        if (m.content_json?.chaired_by && normalizeSearch(m.content_json.chaired_by).includes(q)) return true;
        return false;
      });
    }
    // Sort standalone
    list = [...list].sort((a, b) => {
      if (sortField === "date") {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return sortDir === "desc" ? db - da : da - db;
      }
      const ta = (a.title || "").toLowerCase();
      const tb = (b.title || "").toLowerCase();
      return sortDir === "desc" ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });
    return list;
  }, [minutes, searchQuery, sortField, sortDir]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;
  const selectedMinutes = standaloneMode
    ? (selectedStandaloneId ? minutes.find((m) => m.id === selectedStandaloneId) || null : null)
    : (selectedEventId ? minutesByEventId[selectedEventId] || null : null);

  // Set rich text content via textContent when initializing editor
  useEffect(() => {
    if (editMode && contentEditableRef.current && richTextInitContent) {
      contentEditableRef.current.textContent = richTextInitContent;
    }
  }, [editMode, richTextInitContent]);

  // ─── Editor initialization ──────────────────────────────────────────────

  const initEditor = useCallback(
    async (minutesData: MinutesRecord | null, event: EventRecord | null) => {
      if (minutesData) {
        const content = minutesData.content_json || ({} as ContentJson);
        setEditorLocation(content.location || event?.location || "");
        setEditorChairedBy(content.chaired_by || "");
        setEditorPlainText(content.text || "");
        setRichTextInitContent(content.text || "");
        setEditorDecisions(minutesData.decisions_json || []);
        setEditorActionItems(minutesData.action_items_json || []);
        setEditorAttendees(Array.isArray(minutesData.attendees_json) ? minutesData.attendees_json.map(String) : []);
      } else {
        const template = t("templateHint");
        setEditorLocation(event?.location || "");
        setEditorChairedBy("");
        setEditorPlainText(template);
        setRichTextInitContent(template);
        setEditorDecisions([]);
        setEditorActionItems([]);

        // Auto-populate attendees from event attendance records
        if (event?.id) {
          try {
            const { data: attendance } = await supabase
              .from("event_attendances")
              .select("membership_id")
              .eq("event_id", event.id)
              .eq("status", "present");
            if (attendance && attendance.length > 0) {
              setEditorAttendees(attendance.map((a) => a.membership_id));
            } else {
              setEditorAttendees([]);
            }
          } catch {
            setEditorAttendees([]);
          }
        } else {
          setEditorAttendees([]);
        }
      }
      setUploadedFileName(null);
      setUploadedFile(null);
      setEditorTab("rich");
    },
    [t, supabase]
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
    if (!groupId || !user) return;
    if (!standaloneMode && !selectedEvent) return;
    if (standaloneMode && !standaloneTitle.trim() && !selectedStandaloneId) return;
    // Mutual exclusion: prevent both "Save Draft" and "Publish" from firing simultaneously
    if (saving) return;
    setSaving(true);

    const textContent =
      editorTab === "rich"
        ? contentEditableRef.current?.innerText || ""
        : editorPlainText;

    // Upload file attachment if present
    let fileUrl: string | null = null;
    if (uploadedFile) {
      try {
        const path = `minutes/${groupId}/${Date.now()}-${uploadedFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("group-documents")
          .upload(path, uploadedFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage
          .from("group-documents")
          .getPublicUrl(path);
        fileUrl = urlData.publicUrl;
      } catch (err) {
        showError((err as Error).message || tc("error"));
        setSaving(false);
        return;
      }
    }

    const payload: Record<string, unknown> = {
      group_id: groupId,
      title: standaloneMode ? standaloneTitle.trim() : selectedEvent!.title,
      title_fr: standaloneMode ? null : (selectedEvent!.title_fr || null),
      content_json: {
        text: textContent,
        chaired_by: editorChairedBy,
        location: editorLocation,
      },
      decisions_json: editorDecisions,
      action_items_json: editorActionItems,
      attendees_json: editorAttendees,
      status,
      created_by: user.id,
    };

    if (fileUrl) {
      payload.file_url = fileUrl;
    }

    if (!standaloneMode && selectedEvent) {
      payload.event_id = selectedEvent.id;
    }

    if (status === "published") {
      payload.published_at = new Date().toISOString();
      payload.published_by = user.id;
    }

    try {
      if (selectedMinutes?.id && (standaloneMode || selectedMinutes.event_id === selectedEvent?.id)) {
        // Update existing
        const { error } = await supabase
          .from("meeting_minutes")
          .update(payload)
          .eq("id", selectedMinutes.id);
        if (error) throw error;
      } else if (!standaloneMode) {
        // Upsert by event_id
        const { error } = await supabase
          .from("meeting_minutes")
          .upsert(payload, { onConflict: "event_id" });
        if (error) throw error;
      } else {
        // Insert standalone
        const { error } = await supabase
          .from("meeting_minutes")
          .insert(payload);
        if (error) throw error;
      }

      // Notify members on publish
      if (status === "published") {
        const minutesTitle = payload.title as string;

        // In-app notifications
        // notifications table requires: user_id (not membership_id), body (not message),
        // and a valid notification_type enum value (use "system")
        try {
          const { data: allMembers } = await supabase
            .from("memberships")
            .select("id, user_id")
            .eq("group_id", groupId)
            .not("user_id", "is", null);
          if (allMembers && allMembers.length > 0) {
            const notifications = allMembers.map((m) => ({
              group_id: groupId,
              user_id: m.user_id,
              type: "system" as const,
              title: t("minutesPublished"),
              body: t("minutesPublishedMsg", { title: minutesTitle }),
              is_read: false,
              data: { link: "/dashboard/minutes" },
            }));
            await supabase.from("notifications").insert(notifications);
          }
        } catch { /* notification failure shouldn't block save */ }

        // Email notifications (fire-and-forget)
        // Guard: only send to members with user_id (skip proxy members)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && members) {
            const realMembers = (members as Array<Record<string, unknown>>).filter(
              (m) => m.user_id && !m.is_proxy
            );
            if (realMembers.length > 0) {
              const meetingDate = selectedEvent?.starts_at
                ? formatDateWithGroupFormat(selectedEvent.starts_at, groupDateFormat, locale)
                : formatDateWithGroupFormat(new Date(), groupDateFormat, locale);
              const publisherName = user?.full_name || user?.display_name || tc("admin");

              // Notify each member via their preferred channels
              const prefSupabase = createClient();
              Promise.allSettled(
                realMembers.map(async (m) => {
                  const uid = m.user_id as string;
                  let sendEmail = true, sendSms = true, sendWhatsapp = true;
                  try {
                    const prefs = await getEnabledChannels(prefSupabase, uid, "minutes_published", groupId!);
                    sendEmail = prefs.email;
                    sendSms = prefs.sms;
                    sendWhatsapp = prefs.whatsapp;
                  } catch { /* fail-open */ }

                  const emailData = {
                    memberName: getMemberName(m) || tc("member"),
                    groupName: currentGroup?.name || "",
                    meetingTitle: minutesTitle || (selectedEvent ? (locale === "fr" && selectedEvent.title_fr ? selectedEvent.title_fr : selectedEvent.title) : ""),
                    meetingDate,
                    publishedBy: publisherName,
                    minutesUrl: `${window.location.origin}/${locale}/dashboard/minutes`,
                  };

                  // Email (fire-and-forget)
                  if (sendEmail) {
                    fetch("/api/email/send", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        to: uid,
                        template: "minutes-published",
                        data: emailData,
                        locale,
                      }),
                    }).catch(() => {});
                  }

                  // SMS (fire-and-forget)
                  if (sendSms) {
                    fetch("/api/sms/send", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        to: uid,
                        template: "minutes-published",
                        data: {
                          groupName: currentGroup?.name || "",
                          meetingTitle: minutesTitle,
                        },
                        locale,
                      }),
                    }).catch(() => {});
                  }

                  // WhatsApp (fire-and-forget)
                  if (sendWhatsapp) {
                    fetch("/api/whatsapp/send", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        to: uid,
                        type: "minutes_published",
                        data: {
                          groupName: currentGroup?.name || "",
                          meetingTitle: minutesTitle,
                          meetingDate,
                        },
                        locale,
                      }),
                    }).catch(() => {});
                  }
                })
              ).catch(() => {}); // Fire and forget
            }
          }
        } catch {
          // Notifications are non-critical — never block minutes publish
        }
      }

      // Audit log for publish
      if (status === "published") {
        try {
          const { logActivity } = await import("@/lib/audit-log");
          await logActivity(supabase, {
            groupId: groupId!,
            action: "minutes.published",
            entityType: "event",
            description: `Meeting minutes published: ${payload.title}`,
            metadata: { title: payload.title },
          });
        } catch { /* best-effort */ }
      }

      queryClient.invalidateQueries({ queryKey: ["meeting-minutes", groupId] });
      setEditMode(false);
      setStandaloneMode(false);
      showSuccess(status === "published" ? t("minutesPublished") : t("minutesSaved"));
    } catch (err) {
      showError((err as Error).message || tc("error"));
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!selectedMinutes || !groupId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("meeting_minutes")
        .update({ status: "draft", published_at: null, published_by: null })
        .eq("id", selectedMinutes.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["meeting-minutes", groupId] });
    } catch (err) {
      showError((err as Error).message || tc("error"));
    } finally {
      setSaving(false);
    }
  };

  // ─── Action item status toggle (admin) ──────────────────────────────────

  const handleToggleActionStatus = async (
    minutesRecord: MinutesRecord,
    actionIndex: number
  ) => {
    if (!canManageMinutes || !groupId) return;
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
      showError((err as Error).message || tc("error"));
    }
  };

  // ─── Delete minutes ─────────────────────────────────────────────────────

  const handleDeleteMinutes = async () => {
    if (!deleteMinutesId || !groupId) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase
        .from("meeting_minutes")
        .delete()
        .eq("id", deleteMinutesId);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["meeting-minutes", groupId] });
      // Clear selection if the deleted minutes were open
      if (selectedMinutes?.id === deleteMinutesId) {
        setEditMode(false);
        setStandaloneMode(false);
      }
      setDeleteMinutesId(null);
    } catch (err) {
      showError((err as Error).message || t("deleteMinutesFailed"));
    } finally {
      setDeleting(false);
    }
  };

  // ─── Cancel meeting (linked event) ─────────────────────────────────────

  const handleCancelMeeting = async () => {
    if (!selectedEvent || !groupId || cancellingMeeting) return;
    if (!confirm(t("cancelMeetingConfirm"))) return;
    setCancellingMeeting(true);
    try {
      const { error: err } = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", selectedEvent.id);
      if (err) throw err;
      // Notify ALL group members (not just RSVPd — most members never RSVP)
      // notifications table requires: user_id (not membership_id), body (not message),
      // and a valid notification_type enum value (use "system")
      try {
        const { data: allMembers } = await supabase
          .from("memberships")
          .select("id, user_id")
          .eq("group_id", groupId)
          .not("user_id", "is", null);
        if (allMembers && allMembers.length > 0) {
          await supabase.from("notifications").insert(
            allMembers.map((m) => ({
              group_id: groupId,
              user_id: m.user_id,
              type: "system" as const,
              title: t("meetingCancelledNotifTitle"),
              body: t("meetingCancelledNotifBody", { title: selectedEvent.title }),
              is_read: false,
              data: { link: "/dashboard/minutes" },
            }))
          );
        }
      } catch { /* best-effort notification */ }
      await queryClient.invalidateQueries({ queryKey: ["events", groupId] });
      setSelectedEventId(null);
      setEditMode(false);
    } catch (err) {
      showError((err as Error).message || tc("error"));
    } finally {
      setCancellingMeeting(false);
    }
  };

  // ─── Attendee helpers ───────────────────────────────────────────────────

  const addAttendee = (membershipId: string) => {
    if (!editorAttendees.includes(membershipId)) {
      setEditorAttendees((prev) => [...prev, membershipId]);
    }
  };

  const removeAttendee = (membershipId: string) => {
    setEditorAttendees((prev) => prev.filter((id) => id !== membershipId));
  };

  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of (members || []) as Record<string, unknown>[]) {
      map[m.id as string] = getMemberName(m);
    }
    return map;
  }, [members]);

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

  // Removed: no longer require events to exist. Admins can create standalone minutes.

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
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Success notification */}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {actionSuccess}
          <button onClick={() => setActionSuccess(null)} className="ml-auto text-emerald-600/70 hover:text-emerald-800 dark:hover:text-emerald-300">✕</button>
        </div>
      )}

      {/* Error notification */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto text-destructive/70 hover:text-destructive">✕</button>
        </div>
      )}

      {/* Read-only notice for members */}
      {!canManageMinutes && (
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

          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Button
              variant={sortField === "date" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (sortField === "date") {
                  setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                } else {
                  setSortField("date");
                  setSortDir("desc");
                }
              }}
            >
              {t("sortByDate")} {sortField === "date" && (sortDir === "desc" ? "↓" : "↑")}
            </Button>
            <Button
              variant={sortField === "title" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (sortField === "title") {
                  setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                } else {
                  setSortField("title");
                  setSortDir("asc");
                }
              }}
            >
              {t("sortByTitle")} {sortField === "title" && (sortDir === "desc" ? "↓" : "↑")}
            </Button>
          </div>

          {/* New Standalone Minutes button */}
          {canManageMinutes && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSelectedEventId(null);
                setStandaloneMode(true);
                setSelectedStandaloneId(null);
                setStandaloneTitle("");
                initEditor(null, null);
                setEditMode(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("newStandalone")}
            </Button>
          )}

          {/* Standalone minutes in list */}
          {standaloneMinutes.length > 0 && (
            <div className="space-y-2">
              {standaloneMinutes
                .filter((m) => canManageMinutes || m.status === "published")
                .map((m) => (
                <Card
                  key={m.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    selectedStandaloneId === m.id && "border-primary ring-1 ring-primary"
                  )}
                  onClick={() => {
                    setSelectedEventId(null);
                    setStandaloneMode(true);
                    setSelectedStandaloneId(m.id);
                    setStandaloneTitle(m.title || "");
                    setEditMode(false);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">{m.title || t("newStandalone")}</h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(m.created_at)}</span>
                        </div>
                      </div>
                      <Badge variant={m.status === "published" ? "default" : "secondary"} className={m.status === "published" ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}>
                        {m.status === "published" ? t("published") : t("draft")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Event list */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredEvents.length === 0 && standaloneMinutes.length === 0 ? (
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
                          {locale === "fr" && event.title_fr ? event.title_fr : event.title}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDateTime(event.starts_at, locale)}</span>
                        </div>
                        {event.event_type && (
                          <Badge
                            variant="outline"
                            className="mt-1.5 text-xs"
                          >
                            {t(`eventType_${event.event_type}`)}
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
          {!selectedEvent && !standaloneMode ? (
            /* No event selected */
            <Card className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">{t("selectEvent")}</p>
              </div>
            </Card>
          ) : editMode && canManageMinutes ? (
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
                {/* Standalone title */}
                {standaloneMode && (
                  <div className="space-y-2">
                    <Label>{t("standaloneTitle")}</Label>
                    <Input
                      value={standaloneTitle}
                      onChange={(e) => setStandaloneTitle(e.target.value)}
                      placeholder={t("standaloneTitle")}
                    />
                  </div>
                )}

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
                        {selectedEvent ? formatDateTime(selectedEvent.starts_at) : formatDate(new Date().toISOString())}
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
                      setEditorTab(v as "rich" | "template" | "plain" | "upload")
                    }
                  >
                    <TabsList>
                      <TabsTrigger value="rich">{t("richText")}</TabsTrigger>
                      <TabsTrigger value="template">{t("template")}</TabsTrigger>
                      <TabsTrigger value="plain">
                        {t("plainText")}
                      </TabsTrigger>
                      <TabsTrigger value="upload">
                        {t("uploadOnly")}
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

                    <TabsContent value="template" className="space-y-3">
                      {[
                        { key: "callToOrder", label: t("callToOrder") },
                        { key: "rollCall", label: t("rollCall") },
                        { key: "previousMinutes", label: t("previousMinutes") },
                        { key: "treasurerReport", label: t("treasurerReport") },
                        { key: "oldBusiness", label: t("oldBusiness") },
                        { key: "newBusiness", label: t("newBusiness") },
                        { key: "announcements", label: t("announcementsSection") },
                        { key: "nextMeetingDate", label: t("nextMeetingDate") },
                        { key: "adjournment", label: t("adjournment") },
                      ].map((section) => (
                        <Card key={section.key}>
                          <CardHeader className="p-3 pb-0">
                            <CardTitle className="text-sm">{section.label}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-2">
                            <Textarea
                              rows={3}
                              className="text-sm"
                              placeholder={section.label}
                              defaultValue=""
                              onChange={(e) => {
                                // Aggregate all template sections into editorPlainText
                                const allSections = document.querySelectorAll('[data-template-section]');
                                let combined = "";
                                allSections.forEach((el) => {
                                  const textarea = el as HTMLTextAreaElement;
                                  if (textarea.value.trim()) {
                                    combined += `## ${textarea.getAttribute('data-template-section')}\n${textarea.value.trim()}\n\n`;
                                  }
                                });
                                setEditorPlainText(combined);
                              }}
                              data-template-section={section.label}
                            />
                          </CardContent>
                        </Card>
                      ))}
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
                            if (file) {
                              if (file.size > 10 * 1024 * 1024) {
                                showError(t("fileTooLarge"));
                                return;
                              }
                              setUploadedFile(file);
                              setUploadedFileName(file.name);
                            }
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
                      <Select
                        value={a.assignee}
                        onValueChange={(v) =>
                          updateActionItem(i, "assignee", v ?? "")
                        }
                      >
                        <SelectTrigger className="sm:w-40">
                          <SelectValue placeholder={t("selectMember")} />
                        </SelectTrigger>
                        <SelectContent>
                          {(members || []).map((m: Record<string, unknown>) => (
                            <SelectItem key={m.id as string} value={m.id as string}>
                              {getMemberName(m)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

                {/* Attendees Editor */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("attendees")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {editorAttendees.map((id) => (
                      <Badge key={id} variant="secondary" className="gap-1 text-xs">
                        {memberNameMap[id] || "—"}
                        <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => removeAttendee(id)}>×</button>
                      </Badge>
                    ))}
                    {editorAttendees.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t("noAttendees")}</span>
                    )}
                  </div>
                  <select
                    className="flex h-8 w-full max-w-xs rounded-md border border-input bg-transparent px-2 text-xs"
                    value=""
                    onChange={(e) => { if (e.target.value) addAttendee(e.target.value); e.target.value = ""; }}
                  >
                    <option value="">{t("addAttendee")}</option>
                    {(members || [])
                      .filter((m: Record<string, unknown>) => !editorAttendees.includes(m.id as string))
                      .map((m: Record<string, unknown>) => (
                        <option key={m.id as string} value={m.id as string}>{getMemberName(m)}</option>
                      ))
                    }
                  </select>
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
                      {selectedMinutes.title || selectedEvent?.title || t("newStandalone")}
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
                  {canManageMinutes && (
                    <div className="flex gap-2">
                      {selectedMinutes.status === "published" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUnpublish}
                          disabled={saving}
                        >
                          {t("unpublish")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartEdit}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        {tc("edit")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteMinutesId(selectedMinutes.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {t("deleteMinutes")}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Meeting details */}
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvent ? formatDateTime(selectedEvent.starts_at) : formatDate(selectedMinutes.created_at)}</span>
                  </div>
                  {(() => {
                    const loc = selectedMinutes.content_json?.location || selectedEvent?.location;
                    if (!loc) return null;
                    return (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {isUrl(loc) ? (
                          <a href={loc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400">
                            {loc} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span>{loc}</span>
                        )}
                      </div>
                    );
                  })()}
                  {selectedEvent?.meeting_link && (
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={selectedEvent.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400"
                      >
                        {t("joinMeeting")} <ExternalLink className="h-3 w-3" />
                      </a>
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
                  {selectedEvent?.is_recurring && (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">
                        {t("recurringMeeting")} — {selectedEvent.recurrence_rule || ""}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Cancel meeting button — admin only, event-linked, not already cancelled */}
                {canManageMinutes && selectedEvent && selectedEvent.status !== "cancelled" && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleCancelMeeting}
                      disabled={cancellingMeeting}
                    >
                      {cancellingMeeting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="mr-2 h-4 w-4" />
                      )}
                      {t("cancelMeeting")}
                    </Button>
                    <span className="text-xs text-muted-foreground">{t("cancelMeetingHint")}</span>
                  </div>
                )}
                {selectedEvent?.status === "cancelled" && (
                  <Badge variant="destructive">{t("meetingCancelled")}</Badge>
                )}

                {/* File Attachment */}
                {selectedMinutes.file_url && (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t("uploadFile")}</p>
                    </div>
                    <a
                      href={selectedMinutes.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
                    >
                      {t("downloadPDF")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

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
                                    {memberNameMap[item.assignee] || item.assignee || "\u2014"}
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

                {/* Attendees (view mode) */}
                {selectedMinutes.attendees_json && Array.isArray(selectedMinutes.attendees_json) && selectedMinutes.attendees_json.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">
                      {t("attendees")} ({selectedMinutes.attendees_json.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMinutes.attendees_json.map((id) => (
                        <Badge key={String(id)} variant="secondary" className="text-xs">
                          {memberNameMap[String(id)] || "—"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : canManageMinutes ? (
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
                      <td className="py-2 pr-4">{memberNameMap[entry.item.assignee] || entry.item.assignee || "\u2014"}</td>
                      <td className="py-2 pr-4">
                        {entry.item.deadline
                          ? formatDate(entry.item.deadline)
                          : "\u2014"}
                      </td>
                      <td className="py-2">
                        {canManageMinutes ? (
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
      {/* Delete Minutes Confirmation Dialog */}
      <Dialog open={!!deleteMinutesId} onOpenChange={() => setDeleteMinutesId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteMinutes")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedMinutes?.status === "published"
              ? t("deletePublishedConfirm")
              : t("deleteMinutesConfirm")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMinutesId(null)}>{tc("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteMinutes} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
