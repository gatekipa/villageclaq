"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Mail,
  Smartphone,
  MessageCircle,
  Plus,
  Send,
  Clock,
  Users,
  Megaphone,
  CalendarClock,
  FileText,
  Eye,
  CheckCheck,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  EyeOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";

import { useAnnouncements, useMembers } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { normalizeSearch } from "@/lib/utils";
import { getMemberName } from "@/lib/get-member-name";

type AudienceType = "all" | "roles" | "members";
type ScheduleType = "now" | "later";

interface ChannelSelection {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

const AVAILABLE_ROLES = [
  { value: "owner", labelKey: "roleOwner" },
  { value: "admin", labelKey: "roleAdmin" },
  { value: "moderator", labelKey: "roleModerator" },
  { value: "member", labelKey: "roleMember" },
];

const CHANNEL_CONFIG: {
  key: keyof ChannelSelection;
  label: string;
  color: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "in_app",
    label: "channelInApp",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: <Bell className="size-3" />,
  },
  {
    key: "email",
    label: "channelEmail",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <Mail className="size-3" />,
  },
  {
    key: "sms",
    label: "channelSms",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: <Smartphone className="size-3" />,
  },
  {
    key: "whatsapp",
    label: "channelWhatsapp",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: <MessageCircle className="size-3" />,
  },
];

function getStatusBadge(announcement: Record<string, unknown>, t: (key: string) => string) {
  const sentAt = announcement.sent_at as string | null;
  const scheduledAt = announcement.scheduled_at as string | null;
  if (sentAt) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        {t("sent")}
      </Badge>
    );
  }
  if (scheduledAt) {
    return (
      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        {t("scheduled")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      {t("draft")}
    </Badge>
  );
}


export default function AnnouncementsPage() {
  const locale = useLocale();
  const t = useTranslations("communications");
  const tc = useTranslations("common");
  const { groupId, user, currentGroup, currentMembership } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const { hasPermission } = usePermissions();
  const canManageAnnouncements = hasPermission("announcements.manage");
  const queryClient = useQueryClient();
  const { data: announcements, isLoading, error, refetch } = useAnnouncements();
  const { data: membersList } = useMembers();
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const [editAnnId, setEditAnnId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [titleEn, setTitleEn] = useState("");
  const [titleFr, setTitleFr] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [contentFr, setContentFr] = useState("");
  const [channels, setChannels] = useState<ChannelSelection>({
    in_app: true,
    email: false,
    sms: false,
    whatsapp: false,
  });
  const [audience, setAudience] = useState<AudienceType>("all");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  // Holds MEMBERSHIP IDs (not names) so RLS and notification targeting
  // can match rows correctly.
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ScheduleType>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  // Confirmation dialog before the notification blast
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  function toggleChannel(key: keyof ChannelSelection) {
    if (key === "in_app") return;
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  function toggleMember(member: string) {
    setSelectedMembers((prev) =>
      prev.includes(member)
        ? prev.filter((m) => m !== member)
        : [...prev, member]
    );
  }

  function resetForm() {
    setTitleEn("");
    setTitleFr("");
    setContentEn("");
    setContentFr("");
    setChannels({ in_app: true, email: false, sms: false, whatsapp: false });
    setAudience("all");
    setSelectedRoles([]);
    setMemberSearch("");
    setSelectedMembers([]);
    setSchedule("now");
    setScheduledDate("");
  }

  async function handleSend(asDraft = false): Promise<boolean> {
    if (!titleEn.trim() || !groupId || !user) return false;
    if (saving) return false;
    setSaving(true);
    setMutationError(null);
    try {
      const supabase = createClient();
      const activeChannels = Object.entries(channels)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const audienceData =
        audience === "all"
          ? { type: "all" }
          : audience === "roles"
          ? { type: "roles", roles: selectedRoles }
          : { type: "members", members: selectedMembers };
      const { error: insertError } = await supabase.from("announcements").insert({
        group_id: groupId,
        title: titleEn,
        title_fr: titleFr || null,
        content: contentEn,
        content_fr: contentFr || null,
        channels: activeChannels,
        audience: audienceData,
        sent_at: asDraft ? null : schedule === "now" ? new Date().toISOString() : null,
        scheduled_at: !asDraft && schedule === "later" && scheduledDate ? new Date(scheduledDate).toISOString() : null,
        created_by: user.id,
      });
      if (insertError) throw insertError;

      // Dispatch notifications only when actually sending now — not for
      // drafts or future-scheduled rows. The cron drain will handle the
      // latter when scheduled_at is reached.
      if (!asDraft && schedule === "now") {
        await dispatchAnnouncementNotifications({
          supabase,
          audience,
          selectedRoles,
          selectedMembers,
          activeChannels,
          titleEn,
          titleFr,
          contentEn,
          contentFr,
        });
      }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId,
          action: "announcement.sent",
          entityType: "announcement",
          description: `Announcement "${titleEn}" ${asDraft ? "saved as draft" : "sent"}`,
          metadata: { title: titleEn, isDraft: asDraft },
        });
      } catch (err) {
        console.warn("[Announcements:Audit] activity log failed:", err instanceof Error ? err.message : err);
      }

      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["aggregated-feed", groupId] });
      setDialogOpen(false);
      resetForm();
      return true;
    } catch (err) {
      setMutationError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Dispatches the announcement blast. Recipients are computed from the
  // audience field; external channels are restricted to the admin's
  // selection (previously they were force-enabled regardless of the
  // toggles in the form).
  async function dispatchAnnouncementNotifications(args: {
    supabase: ReturnType<typeof createClient>;
    audience: AudienceType;
    selectedRoles: string[];
    selectedMembers: string[];
    activeChannels: string[];
    titleEn: string;
    titleFr: string;
    contentEn: string;
    contentFr: string;
  }): Promise<void> {
    const { supabase, audience, selectedRoles, selectedMembers, activeChannels, titleEn, titleFr, contentEn, contentFr } = args;
    if (!groupId || !user) return;

    let query = supabase
      .from("memberships")
      // profiles.phone intentionally NOT selected. /api/sms/send and
      // /api/whatsapp/send resolve real-member phone from user_id; proxies
      // read privacy_settings.proxy_phone below.
      .select("id, user_id, role, display_name, is_proxy, standing, privacy_settings, profiles:profiles!memberships_user_id_fkey(full_name)")
      .eq("group_id", groupId);

    if (audience === "roles") {
      if (selectedRoles.length === 0) return;
      query = query.in("role", selectedRoles);
    } else if (audience === "members") {
      if (selectedMembers.length === 0) return;
      query = query.in("id", selectedMembers);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.warn("[Announcements:Notify] membership lookup failed:", error.message);
      return;
    }

    const recipients = (rows || [])
      .filter((m) => m.user_id && m.user_id !== user.id && m.standing !== "banned")
      .map((m) => {
        const privSettings = (m.privacy_settings as Record<string, unknown>) || null;
        // Real-member phones are no longer in the client cache (see
        // useMembers select). Pass `phone` only for proxies; /api/sms/send
        // and /api/whatsapp/send resolve real-member phones from user_id
        // server-side with a recipient-authorisation check.
        const phone = (privSettings?.proxy_phone as string) || null;
        return { userId: m.user_id as string | null, phone };
      });

    if (recipients.length === 0) return;

    const groupName = currentGroup?.name || "";
    try {
      const { notifyBulkFromClient } = await import("@/lib/notify-client");
      // G6: per-recipient localization. The announcement title/body
      // are user-authored (the admin writes both EN and FR). Each
      // recipient sees the copy that matches their preferred_locale
      // stored on profiles — no more "French secretary blasts English
      // members with French copy".
      notifyBulkFromClient(recipients, {
        groupId: groupId!,
        // Fallback static values — used only for rows with no user_id
        // (won't happen for announcements; recipients are filtered to
        // real users upstream).
        title: titleEn,
        body: (contentEn || "").slice(0, 200),
        data: { groupName, title: titleEn, body: (contentEn || "").slice(0, 100) },
        localize: (loc) => {
          const title = (loc === "fr" && titleFr) ? titleFr : titleEn;
          const body = (loc === "fr" && contentFr) ? contentFr : contentEn;
          return {
            title,
            body: (body || "").slice(0, 200),
            data: { title, body: (body || "").slice(0, 100) },
          };
        },
        emailTemplate: "notification",
        smsTemplate: "announcement",
        whatsappType: "announcement",
        inAppType: "announcement",
        locale,
        channels: {
          inApp: activeChannels.includes("in_app"),
          email: activeChannels.includes("email"),
          sms: activeChannels.includes("sms"),
          whatsapp: activeChannels.includes("whatsapp"),
        },
        prefType: "announcements",
      }).catch((err) => {
        console.warn("[Announcements:Notify] bulk dispatch failed:", err instanceof Error ? err.message : err);
      });
    } catch (err) {
      console.warn("[Announcements:Notify] setup failed:", err instanceof Error ? err.message : err);
    }
  }

  function openEditAnnouncement(ann: Record<string, unknown>) {
    setEditAnnId(ann.id as string);
    setTitleEn((ann.title as string) || "");
    setTitleFr((ann.title_fr as string) || "");
    setContentEn((ann.content as string) || "");
    setContentFr((ann.content_fr as string) || "");
    setDialogOpen(true);
  }

  async function handleEditSave(asDraft = false) {
    if (!editAnnId || !titleEn.trim() || !groupId) return;
    setEditSaving(true);
    setMutationError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("announcements")
        .update({
          title: titleEn,
          title_fr: titleFr || null,
          content: contentEn,
          content_fr: contentFr || null,
        })
        .eq("id", editAnnId);
      if (updateError) throw updateError;
      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
      setDialogOpen(false);
      resetForm();
      setEditAnnId(null);
    } catch (err) {
      setMutationError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  }

  const [publishingId, setPublishingId] = useState<string | null>(null);

  async function handlePublish(annId: string) {
    if (publishingId) return;
    setPublishingId(annId);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const { data: updated, error: err } = await supabase
        .from("announcements")
        .update({ sent_at: now })
        .eq("id", annId)
        .select("id");
      if (err) throw err;
      if (!updated || updated.length === 0) {
        throw new Error(t("publishFailed"));
      }

      // Dispatch the blast for the published draft using the row's
      // persisted audience + channel selection (same logic as fresh
      // send). Previously this path force-inserted in-app notifications
      // to every group member and ignored audience + external channels.
      try {
        const ann = allAnnouncements.find((a: Record<string, unknown>) => (a.id as string) === annId) as Record<string, unknown> | undefined;
        if (ann) {
          const audienceJson = (ann.audience as Record<string, unknown>) || { type: "all" };
          const atype = ((audienceJson.type as string) || "all") as AudienceType;
          const aroles = Array.isArray(audienceJson.roles) ? (audienceJson.roles as string[]) : [];
          const amembers = Array.isArray(audienceJson.members) ? (audienceJson.members as string[]) : [];
          const achannels = Array.isArray(ann.channels) ? (ann.channels as string[]) : ["in_app"];
          await dispatchAnnouncementNotifications({
            supabase,
            audience: atype,
            selectedRoles: aroles,
            selectedMembers: amembers,
            activeChannels: achannels,
            titleEn: (ann.title as string) || "",
            titleFr: (ann.title_fr as string) || "",
            contentEn: (ann.content as string) || "",
            contentFr: (ann.content_fr as string) || "",
          });
        }
      } catch (nerr) {
        console.warn("[Announcements:Publish] dispatch failed:", nerr instanceof Error ? nerr.message : nerr);
      }

      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
    } catch (err) {
      setMutationError((err as Error).message || tc("error"));
    } finally {
      setPublishingId(null);
    }
  }

  async function handleUnpublish(annId: string) {
    if (unpublishingId) return;
    setUnpublishingId(annId);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("announcements").update({ sent_at: null }).eq("id", annId);
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
    } catch (err) {
      setMutationError((err as Error).message || tc("error"));
    } finally {
      setUnpublishingId(null);
    }
  }

  async function handleDeleteAnnouncement(annId: string) {
    setDeletingId(annId);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("announcements").delete().eq("id", annId);
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
    } catch (err) {
      setMutationError((err as Error).message || tc("error"));
    } finally {
      setDeletingId(null);
      setShowDeleteConfirm(null);
    }
  }

  // Candidate list for the member-picker. We store membership IDs (not
  // names) in selectedMembers so RLS + recipient filtering match rows.
  const memberPickerOptions = useMemo(
    () =>
      (membersList || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: getMemberName(m),
      })),
    [membersList]
  );
  const filteredMemberOptions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return memberPickerOptions;
    return memberPickerOptions.filter((m) => m.name.toLowerCase().includes(q));
  }, [memberPickerOptions, memberSearch]);

  // Preview recipient count shown on the confirmation dialog. Excludes
  // proxies (no user_id) and banned members — same filter used by the
  // dispatcher.
  const estimatedRecipientCount = useMemo(() => {
    const list = (membersList || []) as Array<Record<string, unknown>>;
    const candidates = list.filter(
      (m) => m.user_id && m.user_id !== user?.id && m.standing !== "banned"
    );
    if (audience === "all") return candidates.length;
    if (audience === "roles") {
      if (selectedRoles.length === 0) return 0;
      return candidates.filter((m) => selectedRoles.includes(m.role as string)).length;
    }
    // members
    if (selectedMembers.length === 0) return 0;
    return candidates.filter((m) => selectedMembers.includes(m.id as string)).length;
  }, [membersList, audience, selectedRoles, selectedMembers, user?.id]);

  const activeChannelLabels = useMemo(() => {
    const parts: string[] = [];
    if (channels.in_app) parts.push(t("channelInApp"));
    if (channels.email) parts.push(t("channelEmail"));
    if (channels.sms) parts.push(t("channelSms"));
    if (channels.whatsapp) parts.push(t("channelWhatsapp"));
    return parts.join(", ");
  }, [channels, t]);

  const allAnnouncements = announcements || [];

  const [annSearch, setAnnSearch] = useState("");
  const [annStatusFilter, setAnnStatusFilter] = useState<"all" | "sent" | "scheduled" | "draft">("all");
  const [sortField, setSortField] = useState<"date" | "title">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const announcementList = useMemo(() => {
    let result = allAnnouncements as Array<Record<string, unknown>>;

    // Defence-in-depth: even if RLS leaks by mistake, never show a
    // non-manager an announcement whose audience excludes them. Drafts
    // are also hidden from members — managers see everything for the
    // management UI.
    if (!canManageAnnouncements) {
      const myRole = currentMembership?.role as string | undefined;
      const myMembershipId = currentMembership?.id as string | undefined;
      result = result.filter((a) => {
        const sentAt = a.sent_at as string | null;
        const scheduledAt = a.scheduled_at as string | null;
        if (!sentAt && !scheduledAt) return false; // drafts
        const aud = (a.audience as Record<string, unknown> | null) || { type: "all" };
        const atype = (aud?.type as string) || "all";
        if (atype === "all") return true;
        if (atype === "roles") {
          const roles = Array.isArray(aud.roles) ? (aud.roles as string[]) : [];
          return !!myRole && roles.includes(myRole);
        }
        if (atype === "members") {
          const members = Array.isArray(aud.members) ? (aud.members as string[]) : [];
          return !!myMembershipId && members.includes(myMembershipId);
        }
        return false;
      });
    }

    if (annStatusFilter !== "all") {
      result = result.filter((a) => {
        const sentAt = a.sent_at as string | null;
        const scheduledAt = a.scheduled_at as string | null;
        if (annStatusFilter === "sent") return !!sentAt;
        if (annStatusFilter === "scheduled") return !sentAt && !!scheduledAt;
        if (annStatusFilter === "draft") return !sentAt && !scheduledAt;
        return true;
      });
    }
    if (annSearch.trim()) {
      const q = normalizeSearch(annSearch);
      result = result.filter((a) => {
        const title = (a.title as string) || "";
        const content = (a.content as string) || "";
        return normalizeSearch(title).includes(q) || normalizeSearch(content).includes(q);
      });
    }
    result = [...result].sort((a, b) => {
      if (sortField === "date") {
        const dateA = (a.sent_at as string) || (a.scheduled_at as string) || (a.created_at as string) || "";
        const dateB = (b.sent_at as string) || (b.scheduled_at as string) || (b.created_at as string) || "";
        return sortDir === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      }
      const titleA = ((a.title as string) || "").toLowerCase();
      const titleB = ((b.title as string) || "").toLowerCase();
      return sortDir === "asc" ? titleA.localeCompare(titleB) : titleB.localeCompare(titleA);
    });
    return result;
  }, [allAnnouncements, annStatusFilter, annSearch, sortField, sortDir, canManageAnnouncements, currentMembership?.role, currentMembership?.id]);

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("announcements")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("announcementsSubtitle")}
          </p>
        </div>
        {canManageAnnouncements && (
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { resetForm(); setEditAnnId(null); } }}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" data-icon="inline-start" />
                {t("createAnnouncement")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editAnnId ? t("editAnnouncement") : t("createAnnouncement")}</DialogTitle>
              <DialogDescription>
                {t("announcementsSubtitle")}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
              {/* Title EN */}
              <div className="space-y-2">
                <Label htmlFor="title-en">{t("announcementTitle")} (EN)</Label>
                <Input
                  id="title-en"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder={t("titlePlaceholderEn")}
                />
              </div>

              {/* Title FR */}
              <div className="space-y-2">
                <Label htmlFor="title-fr">{t("announcementTitleFr")}</Label>
                <Input
                  id="title-fr"
                  value={titleFr}
                  onChange={(e) => setTitleFr(e.target.value)}
                  placeholder={t("titlePlaceholderFr")}
                />
              </div>

              {/* Content EN */}
              <div className="space-y-2">
                <Label htmlFor="content-en">
                  {t("announcementContent")} (EN)
                </Label>
                <Textarea
                  id="content-en"
                  value={contentEn}
                  onChange={(e) => setContentEn(e.target.value)}
                  placeholder={t("contentPlaceholderEn")}
                  className="min-h-[120px]"
                />
              </div>

              {/* Content FR */}
              <div className="space-y-2">
                <Label htmlFor="content-fr">{t("announcementContentFr")}</Label>
                <Textarea
                  id="content-fr"
                  value={contentFr}
                  onChange={(e) => setContentFr(e.target.value)}
                  placeholder={t("contentPlaceholderFr")}
                  className="min-h-[120px]"
                />
              </div>

              {/* Channels */}
              <div className="space-y-3">
                <Label>{t("selectChannels")}</Label>
                <div className="flex flex-wrap gap-3">
                  {CHANNEL_CONFIG.map((ch) => (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => toggleChannel(ch.key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        channels[ch.key]
                          ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                          : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                      } ${ch.key === "in_app" ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                    >
                      {ch.icon}
                      <span>{t(ch.label)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience */}
              <div className="space-y-3">
                <Label>{t("audience")}</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "all", label: "audienceAll" },
                      { key: "roles", label: "audienceRoles" },
                      { key: "members", label: "audienceMembers" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAudience(opt.key)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        audience === opt.key
                          ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                          : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                      }`}
                    >
                      {t(opt.label)}
                    </button>
                  ))}
                </div>

                {audience === "roles" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AVAILABLE_ROLES.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => toggleRole(role.value)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                          selectedRoles.includes(role.value)
                            ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                            : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                        }`}
                      >
                        {t(role.labelKey)}
                      </button>
                    ))}
                  </div>
                )}

                {audience === "members" && (
                  <div className="mt-2 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder={t("searchMembers")}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredMemberOptions.map((opt: { id: string; name: string }) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleMember(opt.id)}
                          className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            selectedMembers.includes(opt.id)
                              ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                              : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                          }`}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="space-y-3">
                <Label>{t("scheduledFor")}</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSchedule("now")}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      schedule === "now"
                        ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                        : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                    }`}
                  >
                    <Send className="size-3.5" />
                    {t("scheduleNow")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedule("later")}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      schedule === "later"
                        ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                        : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                    }`}
                  >
                    <CalendarClock className="size-3.5" />
                    {t("scheduleLater")}
                  </button>
                </div>
                {schedule === "later" && (
                  <Input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full sm:w-64"
                  />
                )}
              </div>
            </div>

            {mutationError && (
              <p className="text-sm text-destructive">{mutationError}</p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {editAnnId ? (
                <Button onClick={() => handleEditSave()} disabled={editSaving || !titleEn.trim()}>
                  {editSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span className="ml-1">{t("updateAnnouncement")}</span>
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => handleSend(true)} disabled={saving || !titleEn.trim()}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    <span className="ml-1">{t("saveDraft")}</span>
                  </Button>
                  <Button
                    onClick={() => setSendConfirmOpen(true)}
                    disabled={
                      saving
                      || !titleEn.trim()
                      || (audience === "roles" && selectedRoles.length === 0)
                      || (audience === "members" && selectedMembers.length === 0)
                      || (schedule === "later" && !scheduledDate)
                    }
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    <span className="ml-1">{t("sendAnnouncement")}</span>
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Search + Status Filter */}
      {allAnnouncements.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchAnnouncements")} value={annSearch} onChange={(e) => setAnnSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2">
            <Button variant={annStatusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setAnnStatusFilter("all")}>{t("filterAll")}</Button>
            <Button variant={annStatusFilter === "sent" ? "default" : "outline"} size="sm" onClick={() => setAnnStatusFilter("sent")}>{t("filterSent")}</Button>
            <Button variant={annStatusFilter === "scheduled" ? "default" : "outline"} size="sm" onClick={() => setAnnStatusFilter("scheduled")}>{t("filterScheduled")}</Button>
            <Button variant={annStatusFilter === "draft" ? "default" : "outline"} size="sm" onClick={() => setAnnStatusFilter("draft")}>{t("filterDraft")}</Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("sortBy")}:</span>
            <Button variant={sortField === "date" ? "default" : "outline"} size="sm" onClick={() => { if (sortField === "date") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField("date"); setSortDir("desc"); } }}>
              {t("sortDate")} {sortField === "date" && (sortDir === "asc" ? "\u2191" : "\u2193")}
            </Button>
            <Button variant={sortField === "title" ? "default" : "outline"} size="sm" onClick={() => { if (sortField === "title") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField("title"); setSortDir("asc"); } }}>
              {t("sortTitle")} {sortField === "title" && (sortDir === "asc" ? "\u2191" : "\u2193")}
            </Button>
          </div>
        </div>
      )}

      {/* Announcements List */}
      {announcementList.length === 0 ? (
        (annSearch.trim() || annStatusFilter !== "all") ? (
          <EmptyState
            icon={Search}
            title={tc("noSearchResults")}
            description={tc("noSearchResultsDesc")}
            action={<Button variant="outline" onClick={() => { setAnnSearch(""); setAnnStatusFilter("all"); }}>{tc("resetFilters")}</Button>}
          />
        ) : (
          <EmptyState
            icon={Megaphone}
            title={t("noAnnouncements")}
            description={t("noAnnouncementsDesc")}
            action={canManageAnnouncements ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Megaphone className="mr-2 h-4 w-4" />
                {t("createAnnouncement")}
              </Button>
            ) : undefined}
          />
        )
      ) : (
        <div className="space-y-4">
          {announcementList.map((announcement: Record<string, unknown>) => {
            const channelsData = (announcement.channels as string[]) || [];
            const channelObj: Record<string, boolean> = {};
            if (Array.isArray(channelsData)) {
              channelsData.forEach((ch: string) => { channelObj[ch] = true; });
            }
            const sentAt = announcement.sent_at as string | null;
            const scheduledAt = announcement.scheduled_at as string | null;
            const dateStr = sentAt || scheduledAt || (announcement.created_at as string);

            return (
              <Card key={announcement.id as string}>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">
                        {announcement.title as string}
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {announcement.content as string}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(announcement, t)}
                      {canManageAnnouncements && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditAnnouncement(announcement)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t("editAnnouncement")}
                            </DropdownMenuItem>
                            {!(announcement.sent_at as string | null) && (
                              <DropdownMenuItem onClick={() => handlePublish(announcement.id as string)} disabled={publishingId === (announcement.id as string)}>
                                <Send className="mr-2 h-4 w-4" />
                                {t("publishAnnouncement")}
                              </DropdownMenuItem>
                            )}
                            {(announcement.sent_at as string | null) && (
                              <DropdownMenuItem onClick={() => handleUnpublish(announcement.id as string)} disabled={unpublishingId === (announcement.id as string)}>
                                <EyeOff className="mr-2 h-4 w-4" />
                                {t("unpublishAnnouncement")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setShowDeleteConfirm(announcement.id as string)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("deleteAnnouncement")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Date */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    <span>
                      {!sentAt && scheduledAt
                        ? `${t("scheduledFor")}: ${formatDateWithGroupFormat(scheduledAt, groupDateFormat, locale)}`
                        : dateStr ? formatDateWithGroupFormat(dateStr, groupDateFormat, locale) : ""}
                    </span>
                  </div>

                  {/* Channel badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {CHANNEL_CONFIG.filter(
                      (ch) => channelObj[ch.key]
                    ).map((ch) => (
                      <span
                        key={ch.key}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ch.color}`}
                      >
                        {ch.icon}
                        {t(ch.label)}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Send Confirmation Dialog — gates the notification blast */}
      <Dialog
        open={sendConfirmOpen}
        onOpenChange={(open) => { if (!saving) setSendConfirmOpen(open); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sendConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("sendConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground">{t("sendConfirmRecipients")}</span>
              <span className="font-medium">
                {t("sendConfirmRecipientCount", { count: estimatedRecipientCount })}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground">{t("sendConfirmAudience")}</span>
              <span className="font-medium text-right">
                {audience === "all"
                  ? t("audienceAll")
                  : audience === "roles"
                    ? t("audienceRoles")
                    : t("audienceMembers")}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground">{t("sendConfirmChannels")}</span>
              <span className="font-medium text-right">{activeChannelLabels || t("channelInApp")}</span>
            </div>
            {estimatedRecipientCount === 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                {t("sendConfirmNoRecipients")}
              </p>
            )}
          </div>
          {mutationError && (
            <p className="text-sm text-destructive">{mutationError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendConfirmOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (saving) return;
                const ok = await handleSend(false);
                if (ok) setSendConfirmOpen(false);
              }}
              disabled={saving || !titleEn.trim() || estimatedRecipientCount === 0}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              {t("sendConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteAnnouncement")}</DialogTitle>
            <DialogDescription>{t("deleteAnnouncementConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" disabled={!!deletingId} onClick={() => showDeleteConfirm && handleDeleteAnnouncement(showDeleteConfirm)}>
              {deletingId ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t("deleteAnnouncement")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
