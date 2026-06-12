import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTranslator } from "@/lib/cron-notify-helper";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type BilingualTranslator = (
  locale: Locale,
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type EventRow = {
  id: string;
  group_id: string;
  title: string | null;
  title_fr: string | null;
  starts_at: string | null;
  location: string | null;
  status: string | null;
};

type GroupRow = {
  id: string;
  name: string | null;
  is_active: boolean | null;
};

type MembershipRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  is_proxy: boolean | null;
  phone?: string | null;
  privacy_settings: Record<string, unknown> | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  preferred_locale: string | null;
};

export type EventReminderRecipientResult = {
  userId: string;
  status: "queued" | "skipped" | "error";
  reason?: string;
};

export type EventReminderProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  eventId: string;
  whatsappQueued: number;
  recipients: EventReminderRecipientResult[];
};

export type EventReminderProducerOptions = {
  logger?: Logger;
  /** ISO timestamp used for the past-event skip. Defaults to the current
   *  time's toISOString() — injectable so tests are deterministic. */
  now?: string;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "event_reminders",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
}

/** Mirrors the event-reminders cron's email date formatting exactly. */
function formatEventDate(startsAt: string, locale: Locale): string {
  return new Date(startsAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function resolveRecipientPhone(
  supabase: SupabaseClient,
  membership: MembershipRow,
  profile: ProfileRow | null,
): Promise<string | null> {
  const proxyPhone = (membership.privacy_settings?.proxy_phone as string | undefined) || null;
  if (membership.is_proxy) return proxyPhone || membership.phone || null;
  const rowPhone = profile?.phone || membership.phone || proxyPhone || null;
  if (rowPhone || !membership.user_id) return rowPhone;

  try {
    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(membership.user_id);
    return user?.phone || null;
  } catch (err) {
    console.warn("[EventReminderProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function memberName(membership: MembershipRow, profile: ProfileRow | null): string {
  return getMemberName({
    ...membership,
    profile,
  });
}

async function maybeSingle<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  value: string,
): Promise<{ data: T | null; error: { message?: string; code?: string } | null }> {
  return await supabase
    .from(table)
    .select(columns)
    .eq(column, value)
    .maybeSingle();
}

/**
 * Queue WhatsApp event reminders for every eligible member of the
 * event's group.
 *
 * Multi-recipient producer (one queue row per member), replacing the
 * event-reminders cron's direct dispatchWhatsAppWithResult loop. The
 * legacy loop only considered members that had an EMAIL address —
 * phone-but-no-email members never received WhatsApp (latent bug). This
 * producer resolves recipients from memberships directly, fixing that.
 *
 * Recipients are ACTIVE REAL members only (user_id required, is_proxy
 * false) — parity with the legacy WhatsApp path. NOTE: proxy members
 * receive NO event reminders on any channel (also legacy parity — the
 * cron's "leftover-phone" SMS loop excludes proxies via its
 * !isProxy/userId filter and only reaches real members who have a phone
 * but no email). Adding proxy event coverage is a product decision, not
 * a producer concern.
 *
 * eventLocation falls back to the translated cron.eventLocationFallback
 * string when events.location is empty: Meta rejects EMPTY body
 * parameters, and the legacy code passed "" (latent delivery bug).
 *
 * Idempotency is STRICT once-per-event-per-user — NOT a day bucket:
 * events remind once ever (parity with events.reminder_sent_at), so any
 * existing queue row for (eventId, userId), including failed rows,
 * blocks re-enqueue. Old failed rows are never retried. Migration 00097
 * adds the partial unique index backstop that turns concurrent-cron
 * races into the 23505 treated below as a duplicate skip.
 */
export async function produceEventReminderNotification(
  supabase: SupabaseClient,
  eventId: string,
  options: EventReminderProducerOptions = {},
): Promise<EventReminderProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const nowIso = options.now || new Date().toISOString();

  if (!eventId) {
    return { status: "skipped", reason: "missing_event_id", eventId, whatsappQueued: 0, recipients: [] };
  }

  const { data: event, error: eventError } = await maybeSingle<EventRow>(
    supabase,
    "events",
    "id,group_id,title,title_fr,starts_at,location,status",
    "id",
    eventId,
  );

  if (eventError) {
    logger.warn("[EventReminderProducer] event lookup failed", {
      eventId: shortId(eventId),
      error: eventError.message,
    });
    // Transient lookup failures are errors, not skips — they must surface in
    // the cron's failure counters rather than masquerade as benign skips.
    return { status: "error", reason: "event_lookup_failed", eventId, whatsappQueued: 0, recipients: [] };
  }

  if (!event) {
    return { status: "skipped", reason: "event_not_found", eventId, whatsappQueued: 0, recipients: [] };
  }

  if (event.status !== "upcoming") {
    return { status: "skipped", reason: "event_not_upcoming", eventId, whatsappQueued: 0, recipients: [] };
  }

  const startsAtMs = event.starts_at ? new Date(event.starts_at).getTime() : Number.NaN;
  if (!event.starts_at || Number.isNaN(startsAtMs)) {
    return { status: "skipped", reason: "missing_starts_at", eventId, whatsappQueued: 0, recipients: [] };
  }

  if (startsAtMs <= new Date(nowIso).getTime()) {
    return { status: "skipped", reason: "event_in_past", eventId, whatsappQueued: 0, recipients: [] };
  }

  const { data: group, error: groupError } = await maybeSingle<GroupRow>(
    supabase,
    "groups",
    "id,name,is_active",
    "id",
    event.group_id,
  );

  if (groupError) {
    logger.warn("[EventReminderProducer] group lookup failed", {
      eventId: shortId(eventId),
      groupId: shortId(event.group_id),
      error: groupError.message,
    });
    return { status: "error", reason: "group_lookup_failed", eventId, whatsappQueued: 0, recipients: [] };
  }

  if (!group) {
    return { status: "skipped", reason: "group_not_found", eventId, whatsappQueued: 0, recipients: [] };
  }

  if (!group.is_active) {
    return { status: "skipped", reason: "group_inactive", eventId, whatsappQueued: 0, recipients: [] };
  }

  // buildTranslator loads the message bundles once and caches them — call it
  // once per producer invocation, never per recipient.
  let bt: BilingualTranslator;
  try {
    bt = await buildTranslator("cron");
  } catch (err) {
    logger.warn("[EventReminderProducer] translator load failed", {
      eventId: shortId(eventId),
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error", reason: "translator_load_failed", eventId, whatsappQueued: 0, recipients: [] };
  }

  // Recipients: active REAL members only. Proxy members are excluded
  // (legacy parity — the events cron has never notified proxies on any
  // channel; its "leftover-phone" SMS loop filters them out too).
  const { data: members, error: membersError } = await supabase
    .from("memberships")
    .select("id,user_id,display_name,is_proxy,phone,privacy_settings")
    .eq("group_id", event.group_id)
    .eq("membership_status", "active")
    .not("user_id", "is", null)
    .eq("is_proxy", false);

  if (membersError) {
    logger.warn("[EventReminderProducer] recipient lookup failed", {
      eventId: shortId(eventId),
      groupId: shortId(event.group_id),
      error: membersError.message,
    });
    return { status: "error", reason: "recipient_lookup_failed", eventId, whatsappQueued: 0, recipients: [] };
  }

  const groupName = group.name || "";
  const recipients: EventReminderRecipientResult[] = [];
  let whatsappQueued = 0;

  for (const member of (members || []) as MembershipRow[]) {
    const recipientResult = await produceForRecipient(
      supabase,
      event,
      groupName,
      member,
      bt,
      getChannels,
      logger,
    );
    recipients.push(recipientResult);
    if (recipientResult.status === "queued") whatsappQueued += 1;
  }

  if (recipients.length === 0) {
    return {
      status: "skipped",
      reason: "no_recipients",
      eventId,
      template: WA_TEMPLATES.EVENT_REMINDER,
      whatsappQueued: 0,
      recipients,
    };
  }

  const anyQueued = whatsappQueued > 0;
  const anyError = recipients.some((r) => r.status === "error");
  return {
    status: anyQueued ? "queued" : anyError ? "error" : "skipped",
    reason: anyQueued ? undefined : anyError ? "recipient_errors" : "all_recipients_skipped",
    eventId,
    template: WA_TEMPLATES.EVENT_REMINDER,
    whatsappQueued,
    recipients,
  };
}

async function produceForRecipient(
  supabase: SupabaseClient,
  event: EventRow,
  groupName: string,
  membership: MembershipRow,
  bt: BilingualTranslator,
  getChannels: NonNullable<EventReminderProducerOptions["getChannels"]>,
  logger: Logger,
): Promise<EventReminderRecipientResult> {
  const userId = membership.user_id as string;

  const { data: profile, error: profileError } = await maybeSingle<ProfileRow>(
    supabase,
    "profiles",
    "id,full_name,phone,preferred_locale",
    "id",
    userId,
  );

  if (profileError) {
    logger.warn("[EventReminderProducer] profile lookup failed", {
      eventId: shortId(event.id),
      userId: shortId(userId),
      error: profileError.message,
    });
    return { userId, status: "error", reason: "profile_lookup_failed" };
  }

  // Recipient-first locale: the caller is the cron, not the recipient.
  const locale = asLocale(profile?.preferred_locale);

  // Fail-open per recipient: one member's transient preference-lookup
  // failure must not abort the whole multi-recipient batch (legacy parity
  // — the cron's own prefs lookup was fail-open too).
  let channels: EnabledChannels;
  try {
    channels = await getChannels(supabase, userId, "event_reminders", event.group_id);
  } catch (err) {
    logger.warn("[EventReminderProducer] preference lookup failed — failing open", {
      eventId: shortId(event.id),
      userId: shortId(userId),
      error: err instanceof Error ? err.message : String(err),
    });
    channels = { in_app: true, email: true, sms: true, whatsapp: true, push: false };
  }
  if (!channels.whatsapp) {
    return { userId, status: "skipped", reason: "whatsapp_disabled" };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    return { userId, status: "skipped", reason: "missing_phone" };
  }

  const formattedPhone = formatPhoneForWhatsApp(recipientPhone);
  if (!formattedPhone) {
    logger.log("[EventReminderProducer] WhatsApp event reminder skipped", {
      eventId: shortId(event.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { userId, status: "skipped", reason: "invalid_phone" };
  }

  const eventTitle = (locale === "fr" && event.title_fr ? event.title_fr : event.title) || "";
  const eventDate = formatEventDate(event.starts_at as string, locale);
  // Meta rejects EMPTY body parameters and the legacy cron passed "" for
  // location-less events (latent delivery bug) — substitute the translated
  // fallback so the variable is always non-empty.
  const eventLocation = event.location || bt(locale, "eventLocationFallback");
  const recipientName = memberName(membership, profile);

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!recipientName || !eventTitle || !eventDate || !eventLocation || !groupName) {
    logger.warn("[EventReminderProducer] missing template data", {
      eventId: shortId(event.id),
      userId: shortId(userId),
      hasMemberName: !!recipientName,
      hasEventTitle: !!eventTitle,
      hasEventDate: !!eventDate,
      hasEventLocation: !!eventLocation,
      hasGroupName: !!groupName,
    });
    return { userId, status: "skipped", reason: "missing_template_data" };
  }

  const { data: existingQueue, error: dedupeError } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "event_reminder")
    .eq("data->>eventId", event.id)
    .eq("data->>userId", userId)
    .limit(1)
    .maybeSingle();

  if (dedupeError) {
    // Best-effort pre-check: log and proceed — the 00097 unique index is
    // the authoritative guard (23505 below).
    logger.warn("[EventReminderProducer] dedupe pre-check failed", {
      eventId: shortId(event.id),
      userId: shortId(userId),
      error: dedupeError.message,
    });
  }

  // STRICT once-per-event-per-user (parity with events.reminder_sent_at —
  // events remind once ever, never a day bucket): any existing queue row,
  // including failed rows, blocks re-enqueue.
  if (existingQueue) {
    return { userId, status: "skipped", reason: "duplicate_whatsapp_event_reminder" };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "event_reminder",
    status: "queued",
    data: {
      // The normalized (digits-only) form, not the raw profile value.
      recipient: formattedPhone,
      user_id: userId,
      // camelCase duplicate of user_id: migration 00097's unique index keys
      // on (data->>'eventId', data->>'userId') and predicates on data ? 'userId'.
      userId,
      groupId: event.group_id,
      membershipId: membership.id,
      eventId: event.id,
      whatsappType: "event_reminder",
      whatsappData: {
        memberName: recipientName,
        eventTitle,
        eventDate,
        eventLocation,
        groupName,
      },
      template: WA_TEMPLATES.EVENT_REMINDER,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return { userId, status: "skipped", reason: "duplicate_whatsapp_event_reminder" };
    }
    logger.warn("[EventReminderProducer] WhatsApp event reminder queue failed", {
      eventId: shortId(event.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return { userId, status: "error", reason: "whatsapp_queue_failed" };
  }

  logger.log("[EventReminderProducer] WhatsApp event reminder queued", {
    eventId: shortId(event.id),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.EVENT_REMINDER,
  });

  return { userId, status: "queued" };
}
