"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import {
  Bell,
  Mail,
  Smartphone,
  MessageCircle,
  Wifi,
  VolumeX,
  Volume2,
  Moon,
  Save,
  CheckCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";

const supabase = createClient();

type ChannelKey = "in_app" | "email" | "sms" | "whatsapp" | "push";

type NotificationType =
  | "payment_reminders"
  | "event_reminders"
  | "minutes_published"
  | "relief_updates"
  | "standing_changes"
  | "announcements"
  | "hosting_reminders"
  | "new_member";

interface ChannelConfig {
  key: ChannelKey;
  icon: React.ReactNode;
  nameKey: string;
  descKey: string;
  alwaysOn?: boolean;
}

interface TypeConfig {
  key: NotificationType;
  nameKey: string;
  descKey: string;
}

const CHANNELS: ChannelConfig[] = [
  {
    key: "in_app",
    icon: <Bell className="size-5" />,
    nameKey: "channelInApp",
    descKey: "channelInAppDesc",
    alwaysOn: true,
  },
  {
    key: "email",
    icon: <Mail className="size-5" />,
    nameKey: "channelEmail",
    descKey: "channelEmailDesc",
  },
  {
    key: "sms",
    icon: <Smartphone className="size-5" />,
    nameKey: "channelSms",
    descKey: "channelSmsDesc",
  },
  {
    key: "whatsapp",
    icon: <MessageCircle className="size-5" />,
    nameKey: "channelWhatsapp",
    descKey: "channelWhatsappDesc",
  },
  {
    key: "push",
    icon: <Wifi className="size-5" />,
    nameKey: "channelPush",
    descKey: "channelPushDesc",
  },
];

const NOTIFICATION_TYPES: TypeConfig[] = [
  { key: "payment_reminders", nameKey: "typePaymentReminders", descKey: "typePaymentRemindersDesc" },
  { key: "event_reminders", nameKey: "typeEventReminders", descKey: "typeEventRemindersDesc" },
  { key: "minutes_published", nameKey: "typeMinutesPublished", descKey: "typeMinutesPublishedDesc" },
  { key: "relief_updates", nameKey: "typeReliefUpdates", descKey: "typeReliefUpdatesDesc" },
  { key: "standing_changes", nameKey: "typeStandingChanges", descKey: "typeStandingChangesDesc" },
  { key: "announcements", nameKey: "typeAnnouncements", descKey: "typeAnnouncementsDesc" },
  { key: "hosting_reminders", nameKey: "typeHostingReminders", descKey: "typeHostingRemindersDesc" },
  { key: "new_member", nameKey: "typeNewMember", descKey: "typeNewMemberDesc" },
];

const DEFAULT_CHANNELS: Record<ChannelKey, boolean> = {
  in_app: true,
  email: true,
  sms: true,
  whatsapp: true,
  push: false,
};

const DEFAULT_TYPE_PREFS: Record<NotificationType, Record<ChannelKey, boolean>> = {
  payment_reminders: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
  event_reminders: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
  minutes_published: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
  relief_updates: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
  standing_changes: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
  announcements: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
  hosting_reminders: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
  new_member: { in_app: true, email: false, sms: false, whatsapp: false, push: false },
};

export default function NotificationPreferencesPage() {
  const t = useTranslations("communications");
  const { user, memberships } = useGroup();

  const [loaded, setLoaded] = useState(false);
  const [channelEnabled, setChannelEnabled] = useState<Record<ChannelKey, boolean>>(DEFAULT_CHANNELS);
  const [typePreferences, setTypePreferences] = useState<Record<NotificationType, Record<ChannelKey, boolean>>>(DEFAULT_TYPE_PREFS);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");
  const [mutedGroups, setMutedGroups] = useState<Record<string, boolean>>({});
  const [showToast, setShowToast] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Load preferences from profile
  useEffect(() => {
    async function loadPrefs() {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", user.id)
        .single();
      if (data?.notification_preferences) {
        const prefs = data.notification_preferences as Record<string, unknown>;
        if (prefs.channels) setChannelEnabled({ ...DEFAULT_CHANNELS, ...(prefs.channels as Record<string, boolean>) });
        if (prefs.types) {
          const types = prefs.types as Record<string, Record<string, boolean>>;
          setTypePreferences((prev) => {
            const updated = { ...prev };
            for (const key of Object.keys(types)) {
              if (key in updated) {
                updated[key as NotificationType] = { ...updated[key as NotificationType], ...types[key] };
              }
            }
            return updated;
          });
        }
        if (prefs.quiet_hours) {
          const qh = prefs.quiet_hours as Record<string, unknown>;
          setQuietHoursEnabled(!!(qh.enabled));
          if (qh.start) setQuietHoursStart(qh.start as string);
          if (qh.end) setQuietHoursEnd(qh.end as string);
        }
        if (prefs.muted_groups && Array.isArray(prefs.muted_groups)) {
          const muted: Record<string, boolean> = {};
          (prefs.muted_groups as string[]).forEach((gid) => { muted[gid] = true; });
          setMutedGroups(muted);
        }
      }
      setLoaded(true);
    }
    loadPrefs();
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No user");
      const prefs = {
        channels: channelEnabled,
        types: typePreferences,
        quiet_hours: { enabled: quietHoursEnabled, start: quietHoursStart, end: quietHoursEnd },
        muted_groups: Object.entries(mutedGroups).filter(([, v]) => v).map(([k]) => k),
      };
      const { error } = await supabase
        .from("profiles")
        .update({ notification_preferences: prefs })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaveError(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    },
    onError: () => {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 5000);
    },
  });

  function toggleChannel(key: ChannelKey) {
    if (key === "in_app") return;
    const newValue = !channelEnabled[key];
    setChannelEnabled((prev) => ({ ...prev, [key]: newValue }));
    // Cascade: when enabling a global channel, auto-enable it for all
    // notification types so the AND gate in getEnabledChannels() passes.
    // When disabling, auto-disable for all types.
    setTypePreferences((prev) => {
      const updated = { ...prev };
      for (const typeKey of Object.keys(updated) as NotificationType[]) {
        updated[typeKey] = { ...updated[typeKey], [key]: newValue };
      }
      return updated;
    });
  }

  function toggleTypeChannel(type: NotificationType, channel: ChannelKey) {
    setTypePreferences((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type][channel] },
    }));
  }

  function toggleMuteGroup(groupId: string) {
    setMutedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  if (!loaded) return <ListSkeleton rows={5} />;

  const enabledChannels = CHANNELS.filter((ch) => channelEnabled[ch.key]);
  const userGroups = memberships.map((m) => ({ id: m.group_id, name: m.group.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("preferences")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("preferencesSubtitle")}
        </p>
      </div>

      {/* Section 1: Channels */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t("channels")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <Card key={channel.key}>
              <CardContent className="flex items-center gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
                  {channel.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t(channel.nameKey)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(channel.descKey)}
                  </p>
                </div>
                <Switch
                  checked={channelEnabled[channel.key]}
                  onCheckedChange={() => toggleChannel(channel.key)}
                  disabled={channel.alwaysOn}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section 2: Notification Types */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t("notificationTypes")}
        </h2>
        <Card>
          <CardContent className="space-y-0 p-0">
            {/* Header row - hidden on mobile */}
            <div className="hidden border-b px-4 py-3 sm:flex sm:items-center sm:gap-4">
              <div className="flex-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("notificationTypes")}
              </div>
              {enabledChannels.map((ch) => (
                <div
                  key={ch.key}
                  className="w-16 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {t(ch.nameKey)}
                </div>
              ))}
            </div>

            {NOTIFICATION_TYPES.map((type, idx) => (
              <div
                key={type.key}
                className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                  idx < NOTIFICATION_TYPES.length - 1 ? "border-b" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t(type.nameKey)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(type.descKey)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {enabledChannels.map((ch) => (
                    <div
                      key={ch.key}
                      className="flex items-center gap-1.5 sm:w-16 sm:justify-center"
                    >
                      <span className="text-xs text-muted-foreground sm:hidden">
                        {t(ch.nameKey)}
                      </span>
                      <Switch
                        size="sm"
                        checked={typePreferences[type.key][ch.key]}
                        onCheckedChange={() => toggleTypeChannel(type.key, ch.key)}
                        disabled={ch.key === "in_app"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Section 3: Quiet Hours */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t("quietHours")}
        </h2>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
                  <Moon className="size-5" />
                </div>
                <div>
                  <CardTitle>{t("quietHoursEnabled")}</CardTitle>
                  <CardDescription>{t("quietHoursDesc")}</CardDescription>
                </div>
              </div>
              <Switch
                checked={quietHoursEnabled}
                onCheckedChange={setQuietHoursEnabled}
              />
            </div>
          </CardHeader>
          {quietHoursEnabled && (
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">{t("quietHoursStart")}</Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">{t("quietHoursEnd")}</Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </section>

      {/* Section 4: Muted Groups */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t("muteGroups")}
        </h2>
        <Card>
          <CardHeader>
            <CardDescription>{t("muteGroupsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0 p-0 pb-2">
            {userGroups.map((group, idx) => (
              <div
                key={group.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  idx < userGroups.length - 1 ? "border-b" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {mutedGroups[group.id] ? (
                    <VolumeX className="size-4 text-muted-foreground" />
                  ) : (
                    <Volume2 className="size-4 text-foreground" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      mutedGroups[group.id]
                        ? "text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {group.name}
                  </span>
                  {mutedGroups[group.id] && (
                    <Badge variant="secondary" className="text-xs">
                      {t("muteGroup")}
                    </Badge>
                  )}
                </div>
                <Button
                  variant={mutedGroups[group.id] ? "outline" : "ghost"}
                  size="sm"
                  onClick={() => toggleMuteGroup(group.id)}
                >
                  {mutedGroups[group.id] ? t("unmuteGroup") : t("muteGroup")}
                </Button>
              </div>
            ))}
            {userGroups.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("noGroupsToDisplay")}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Save Button */}
      <div className="flex justify-end pb-6">
        <Button onClick={() => saveMutation.mutate()} size="lg" disabled={saveMutation.isPending}>
          <Save className="size-4" data-icon="inline-start" />
          {saveMutation.isPending ? t("saving") : t("save")}
        </Button>
      </div>

      {/* Toast notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border bg-background px-4 py-3 shadow-lg ring-1 ring-foreground/10 animate-in slide-in-from-bottom-4 fade-in">
          <CheckCircle className="size-4 text-emerald-500" />
          <span className="text-sm font-medium text-foreground">
            {t("preferencesSaved")}
          </span>
        </div>
      )}
      {saveError && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-lg dark:border-red-900 dark:bg-red-950 animate-in slide-in-from-bottom-4 fade-in">
          <span className="text-sm font-medium text-red-800 dark:text-red-200">
            {t("preferencesSaveFailed")}
          </span>
        </div>
      )}
    </div>
  );
}
