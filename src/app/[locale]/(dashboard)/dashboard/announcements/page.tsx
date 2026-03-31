"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
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
  "President",
  "Secretary",
  "Treasurer",
  "Member",
  "Elder",
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

function formatDate(dateStr: string, locale: string = "en") {
  return new Date(dateStr).toLocaleDateString(getDateLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnnouncementsPage() {
  const locale = useLocale();
  const t = useTranslations("communications");
  const tc = useTranslations("common");
  const { groupId, user } = useGroup();
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
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ScheduleType>("now");
  const [scheduledDate, setScheduledDate] = useState("");

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

  async function handleSend(asDraft = false) {
    if (!titleEn.trim() || !groupId || !user) return;
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

      // Send in-app notifications if not a draft and In-App channel is selected
      if (!asDraft && schedule === "now" && activeChannels.includes("in_app")) {
        try {
          // Get target members based on audience
          let targetMemberIds: string[] = [];
          if (audience === "all") {
            const { data: allMembers } = await supabase
              .from("memberships")
              .select("user_id")
              .eq("group_id", groupId)
              .not("user_id", "is", null);
            targetMemberIds = (allMembers || []).map((m) => m.user_id).filter(Boolean);
          } else if (audience === "roles" && selectedRoles.length > 0) {
            const { data: roleMembers } = await supabase
              .from("memberships")
              .select("user_id, role")
              .eq("group_id", groupId)
              .in("role", selectedRoles)
              .not("user_id", "is", null);
            targetMemberIds = (roleMembers || []).map((m) => m.user_id).filter(Boolean);
          }
          // For "specific members", selectedMembers contains names not IDs — skip notifications for now
          // (would need member ID mapping for proper targeting)

          if (targetMemberIds.length > 0) {
            // Remove current user from notifications (they sent it, they know)
            const recipientIds = targetMemberIds.filter((id) => id !== user.id);
            // Batch insert notifications (max 50 at a time to avoid timeout)
            for (let i = 0; i < recipientIds.length; i += 50) {
              const batch = recipientIds.slice(i, i + 50).map((userId) => ({
                user_id: userId,
                group_id: groupId,
                type: "announcement",
                title: titleEn,
                body: (contentEn || "").slice(0, 200),
                is_read: false,
              }));
              await supabase.from("notifications").insert(batch);
            }
          }
        } catch {
          // Non-critical — don't fail the announcement if notifications fail
        }
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
      } catch { /* best-effort */ }

      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["aggregated-feed", groupId] });
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      setMutationError((err as Error).message);
    } finally {
      setSaving(false);
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

  async function handleUnpublish(annId: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("announcements").update({ sent_at: null }).eq("id", annId);
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ["announcements", groupId] });
    } catch (err) {
      setMutationError((err as Error).message || tc("error"));
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

  const memberNames = (membersList || []).map((m: Record<string, unknown>) => getMemberName(m));
  const filteredMembers = memberNames.filter((m: string) =>
    m.toLowerCase().includes(memberSearch.toLowerCase())
  );

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const allAnnouncements = announcements || [];

  const [annSearch, setAnnSearch] = useState("");
  const [annStatusFilter, setAnnStatusFilter] = useState<"all" | "sent" | "scheduled" | "draft">("all");

  const announcementList = useMemo(() => {
    let result = allAnnouncements as Array<Record<string, unknown>>;
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
    return result;
  }, [allAnnouncements, annStatusFilter, annSearch]);

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
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                          selectedRoles.includes(role)
                            ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                            : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                        }`}
                      >
                        {t(`roles.${role.toLowerCase()}`)}
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
                      {filteredMembers.map((member: string) => (
                        <button
                          key={member}
                          type="button"
                          onClick={() => toggleMember(member)}
                          className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            selectedMembers.includes(member)
                              ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                              : "border-border bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                          }`}
                        >
                          {member}
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
                  <Button onClick={() => handleSend(false)} disabled={saving || !titleEn.trim()}>
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
                {t("create")}
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
                            {(announcement.sent_at as string | null) && (
                              <DropdownMenuItem onClick={() => handleUnpublish(announcement.id as string)}>
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
                        ? `${t("scheduledFor")}: ${formatDate(scheduledAt, locale)}`
                        : dateStr ? formatDate(dateStr, locale) : ""}
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
