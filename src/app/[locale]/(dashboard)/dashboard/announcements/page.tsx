"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
} from "lucide-react";
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

type AudienceType = "all" | "roles" | "members";
type ScheduleType = "now" | "later";
type AnnouncementStatus = "sent" | "scheduled" | "draft";

interface ChannelSelection {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

interface MockAnnouncement {
  id: string;
  title: string;
  content: string;
  date: string;
  channels: ChannelSelection;
  stats: { sent: number; delivered: number; read: number };
  status: AnnouncementStatus;
}

const AVAILABLE_ROLES = [
  "President",
  "Secretary",
  "Treasurer",
  "Member",
  "Elder",
];

const MOCK_MEMBERS = [
  "Marie Tabi",
  "Jean-Pierre Nkeng",
  "Comfort Fon",
  "Emmanuel Bah",
  "Sylvie Mbu",
];

const MOCK_ANNOUNCEMENTS: MockAnnouncement[] = [
  {
    id: "1",
    title: "Monthly Meeting Rescheduled",
    content:
      "The monthly general meeting has been moved to Saturday, March 29 at 3 PM. Please confirm your attendance through the events page. Refreshments will be provided.",
    date: "2026-03-20T14:30:00",
    channels: { in_app: true, email: true, sms: true, whatsapp: false },
    stats: { sent: 45, delivered: 43, read: 38 },
    status: "sent",
  },
  {
    id: "2",
    title: "Contribution Deadline Reminder",
    content:
      "This is a reminder that March contributions are due by March 25. Members with outstanding balances should settle before the next meeting.",
    date: "2026-03-18T09:00:00",
    channels: { in_app: true, email: true, sms: false, whatsapp: true },
    stats: { sent: 45, delivered: 44, read: 41 },
    status: "sent",
  },
  {
    id: "3",
    title: "New Relief Plan Available",
    content:
      "We are excited to announce a new education relief plan for members' children. Enrollment opens April 1. Visit the relief section for details.",
    date: "2026-03-28T10:00:00",
    channels: { in_app: true, email: true, sms: false, whatsapp: false },
    stats: { sent: 0, delivered: 0, read: 0 },
    status: "scheduled",
  },
  {
    id: "4",
    title: "Annual General Meeting Agenda",
    content:
      "The AGM agenda has been finalized. Key topics include budget review, election of new officers, and proposed constitutional amendments.",
    date: "2026-03-15T16:00:00",
    channels: { in_app: true, email: true, sms: true, whatsapp: true },
    stats: { sent: 45, delivered: 45, read: 42 },
    status: "sent",
  },
  {
    id: "5",
    title: "Welcome New Members",
    content:
      "Please join us in welcoming three new members to our group: Comfort Fon, Emmanuel Bah, and Sylvie Mbu. They will be officially introduced at the next meeting.",
    date: "2026-03-12T11:00:00",
    channels: { in_app: true, email: false, sms: false, whatsapp: false },
    stats: { sent: 42, delivered: 42, read: 35 },
    status: "sent",
  },
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

function getStatusBadge(status: AnnouncementStatus, t: (key: string) => string) {
  switch (status) {
    case "sent":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {t("sent")}
        </Badge>
      );
    case "scheduled":
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          {t("scheduled")}
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="secondary">
          {t("draft")}
        </Badge>
      );
  }
}

export default function AnnouncementsPage() {
  const t = useTranslations("communications");

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

  const [announcements] = useState<MockAnnouncement[]>(MOCK_ANNOUNCEMENTS);

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

  function handleSend() {
    setDialogOpen(false);
    resetForm();
  }

  const filteredMembers = MOCK_MEMBERS.filter((m) =>
    m.toLowerCase().includes(memberSearch.toLowerCase())
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("announcements")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("announcementsSubtitle")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" data-icon="inline-start" />
                {t("createAnnouncement")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("createAnnouncement")}</DialogTitle>
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
                  placeholder="Enter announcement title..."
                />
              </div>

              {/* Title FR */}
              <div className="space-y-2">
                <Label htmlFor="title-fr">{t("announcementTitleFr")}</Label>
                <Input
                  id="title-fr"
                  value={titleFr}
                  onChange={(e) => setTitleFr(e.target.value)}
                  placeholder="Entrez le titre de l'annonce..."
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
                  placeholder="Write your announcement..."
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
                  placeholder="Ecrivez votre annonce..."
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
                        {role}
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
                        placeholder="Search members..."
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredMembers.map((member) => (
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

            <DialogFooter>
              <Button onClick={handleSend}>
                <Send className="size-4" data-icon="inline-start" />
                {t("sendAnnouncement")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-foreground">
              {t("noAnnouncements")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noAnnouncementsDesc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      {announcement.title}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {announcement.content}
                    </CardDescription>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(announcement.status, t)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Date */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  <span>
                    {announcement.status === "scheduled"
                      ? `${t("scheduledFor")}: ${formatDate(announcement.date)}`
                      : formatDate(announcement.date)}
                  </span>
                </div>

                {/* Channel badges */}
                <div className="flex flex-wrap gap-1.5">
                  {CHANNEL_CONFIG.filter(
                    (ch) => announcement.channels[ch.key]
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

                {/* Delivery stats */}
                {announcement.status === "sent" && (
                  <div className="flex flex-wrap gap-4 rounded-lg bg-muted/50 px-3 py-2 dark:bg-muted/30">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Send className="size-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {t("sent")}:
                      </span>
                      <span className="font-medium text-foreground">
                        {announcement.stats.sent}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCheck className="size-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {t("delivered")}:
                      </span>
                      <span className="font-medium text-foreground">
                        {announcement.stats.delivered}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Eye className="size-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {t("read")}:
                      </span>
                      <span className="font-medium text-foreground">
                        {announcement.stats.read}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
