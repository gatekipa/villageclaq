import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type SubscriptionRow = {
  id: string;
  group_id: string;
  tier: string | null;
  status: string | null;
  current_period_end: string | null;
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
  role?: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  preferred_locale: string | null;
};

export type SubscriptionExpiringRecipientResult = {
  userId: string;
  status: "queued" | "skipped" | "error";
  reason?: string;
};

export type SubscriptionExpiringProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  subscriptionId: string;
  reminderDate: string;
  daysLeft?: number;
  whatsappQueued: number;
  recipients: SubscriptionExpiringRecipientResult[];
};

export type SubscriptionExpiringProducerOptions = {
  /** UTC day bucket (YYYY-MM-DD). Defaults to today. One WhatsApp reminder
   *  per subscription per recipient per bucket — same-day reruns are
   *  idempotent while each later day inside the 7-day window reminds again
   *  (the daysLeft countdown is intentional). */
  reminderDate?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "subscription_updates",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add whole days to a YYYY-MM-DD day string, staying in UTC. */
function addDaysUtc(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    console.warn("[SubscriptionExpiringProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
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
 * Queue WhatsApp subscription-expiring reminders for a group's billing
 * contacts (the group's active owner/admin memberships with accounts).
 *
 * Multi-recipient producer: one queue row per eligible owner/admin, each
 * with the recipient's own preferred locale and subscription_updates
 * preference. Proxy admins are EXCLUDED (user_id required AND is_proxy
 * false) — billing notices only ever go to real accounts.
 *
 * BILLING STATE IS SACRED: this producer only READS group_subscriptions
 * (id, group_id, tier, status, current_period_end). It never calls
 * update/insert/delete on that table and never touches stripe fields.
 *
 * Idempotency is a per-recipient DAY BUCKET, not strict exactly-once:
 * the reminder legitimately repeats on each scheduled day while the
 * subscription sits inside the 7-day expiry window — the daysLeft
 * countdown is the point — so any existing queue row for the same
 * (subscriptionId, reminderDate, userId), including failed rows, blocks
 * re-enqueue. Same-day cron reruns and retries are therefore safe, while
 * the next day's run reminds again. Old failed rows are never retried.
 * Migration 00097 adds the composite partial unique index backstop.
 *
 * daysLeft is computed deterministically from the reminderDate bucket
 * (never the wall clock), so reruns inside the same bucket render the
 * same template variables.
 */
export async function produceSubscriptionExpiringNotification(
  supabase: SupabaseClient,
  subscriptionId: string,
  options: SubscriptionExpiringProducerOptions = {},
): Promise<SubscriptionExpiringProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const reminderDate = options.reminderDate || todayUtc();

  if (!subscriptionId) {
    return { status: "skipped", reason: "missing_subscription_id", subscriptionId, reminderDate, whatsappQueued: 0, recipients: [] };
  }

  const { data: subscription, error: subscriptionError } = await maybeSingle<SubscriptionRow>(
    supabase,
    "group_subscriptions",
    "id,group_id,tier,status,current_period_end",
    "id",
    subscriptionId,
  );

  if (subscriptionError) {
    logger.warn("[SubscriptionExpiringProducer] subscription lookup failed", {
      subscriptionId: shortId(subscriptionId),
      error: subscriptionError.message,
    });
    // Transient lookup failures are errors, not skips — they must surface in
    // the cron's failure counters rather than masquerade as benign skips.
    return { status: "error", reason: "subscription_lookup_failed", subscriptionId, reminderDate, whatsappQueued: 0, recipients: [] };
  }

  if (!subscription) {
    return { status: "skipped", reason: "subscription_not_found", subscriptionId, reminderDate, whatsappQueued: 0, recipients: [] };
  }

  // Covers cancelled/expired/past_due — only active subscriptions remind.
  if (subscription.status !== "active") {
    return { status: "skipped", reason: "subscription_not_active", subscriptionId, reminderDate, whatsappQueued: 0, recipients: [] };
  }

  if (!subscription.current_period_end) {
    return { status: "skipped", reason: "missing_period_end", subscriptionId, reminderDate, whatsappQueued: 0, recipients: [] };
  }

  // Deterministic from the reminderDate bucket — never the wall clock.
  const periodEndDay = String(subscription.current_period_end).slice(0, 10);
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(subscription.current_period_end).getTime() -
        new Date(`${reminderDate}T00:00:00.000Z`).getTime()) / 86400000,
    ),
  );

  if (periodEndDay < reminderDate) {
    return { status: "skipped", reason: "subscription_already_expired", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  if (periodEndDay > addDaysUtc(reminderDate, 7)) {
    return { status: "skipped", reason: "outside_reminder_window", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  const { data: group, error: groupError } = await maybeSingle<GroupRow>(
    supabase,
    "groups",
    "id,name,is_active",
    "id",
    subscription.group_id,
  );

  if (groupError) {
    logger.warn("[SubscriptionExpiringProducer] group lookup failed", {
      subscriptionId: shortId(subscriptionId),
      groupId: shortId(subscription.group_id),
      error: groupError.message,
    });
    return { status: "error", reason: "group_lookup_failed", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  if (!group) {
    return { status: "skipped", reason: "group_not_found", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  if (!group.is_active) {
    return { status: "skipped", reason: "group_inactive", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  const planName = subscription.tier || "";

  // Meta rejects empty body parameters — never enqueue blank variables.
  // days is always non-blank (String(daysLeft) of a clamped number).
  if (!planName) {
    logger.warn("[SubscriptionExpiringProducer] missing template data", {
      subscriptionId: shortId(subscriptionId),
      hasPlanName: false,
    });
    return { status: "skipped", reason: "missing_template_data", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  // Recipients: the group's active owner/admins with real accounts.
  // Proxy admins are excluded — billing contacts must have accounts.
  const { data: admins, error: adminsError } = await supabase
    .from("memberships")
    .select("id,user_id,display_name,is_proxy,phone,privacy_settings,role")
    .eq("group_id", subscription.group_id)
    .in("role", ["owner", "admin"])
    .eq("membership_status", "active")
    .not("user_id", "is", null)
    .eq("is_proxy", false);

  if (adminsError) {
    logger.warn("[SubscriptionExpiringProducer] billing contact lookup failed", {
      subscriptionId: shortId(subscriptionId),
      error: adminsError.message,
    });
    return { status: "error", reason: "recipient_lookup_failed", subscriptionId, reminderDate, daysLeft, whatsappQueued: 0, recipients: [] };
  }

  const recipients: SubscriptionExpiringRecipientResult[] = [];
  let whatsappQueued = 0;

  for (const admin of (admins || []) as MembershipRow[]) {
    const recipientResult = await produceForRecipient(
      supabase,
      subscription,
      { planName, days: String(daysLeft) },
      daysLeft,
      reminderDate,
      admin,
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
      subscriptionId,
      reminderDate,
      daysLeft,
      template: WA_TEMPLATES.SUBSCRIPTION_EXPIRING,
      whatsappQueued: 0,
      recipients,
    };
  }

  const anyQueued = whatsappQueued > 0;
  const anyError = recipients.some((r) => r.status === "error");
  return {
    status: anyQueued ? "queued" : anyError ? "error" : "skipped",
    reason: anyQueued ? undefined : anyError ? "recipient_errors" : "all_recipients_skipped",
    subscriptionId,
    reminderDate,
    daysLeft,
    template: WA_TEMPLATES.SUBSCRIPTION_EXPIRING,
    whatsappQueued,
    recipients,
  };
}

async function produceForRecipient(
  supabase: SupabaseClient,
  subscription: SubscriptionRow,
  vars: { planName: string; days: string },
  daysLeft: number,
  reminderDate: string,
  membership: MembershipRow,
  getChannels: NonNullable<SubscriptionExpiringProducerOptions["getChannels"]>,
  logger: Logger,
): Promise<SubscriptionExpiringRecipientResult> {
  const userId = membership.user_id as string;

  const { data: profile, error: profileError } = await maybeSingle<ProfileRow>(
    supabase,
    "profiles",
    "id,full_name,phone,preferred_locale",
    "id",
    userId,
  );

  if (profileError) {
    logger.warn("[SubscriptionExpiringProducer] profile lookup failed", {
      subscriptionId: shortId(subscription.id),
      userId: shortId(userId),
      error: profileError.message,
    });
    return { userId, status: "error", reason: "profile_lookup_failed" };
  }

  // Recipient-first locale: the caller is the cron, not the recipient.
  const locale = asLocale(profile?.preferred_locale);

  const channels = await getChannels(supabase, userId, "subscription_updates", subscription.group_id);
  if (!channels.whatsapp) {
    return { userId, status: "skipped", reason: "whatsapp_disabled" };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    return { userId, status: "skipped", reason: "missing_phone" };
  }

  const formattedPhone = formatPhoneForWhatsApp(recipientPhone);
  if (!formattedPhone) {
    logger.log("[SubscriptionExpiringProducer] WhatsApp reminder skipped", {
      subscriptionId: shortId(subscription.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { userId, status: "skipped", reason: "invalid_phone" };
  }

  const { data: existingQueue, error: dedupeError } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "subscription_expiring")
    .eq("data->>subscriptionId", subscription.id)
    .eq("data->>reminderDate", reminderDate)
    .eq("data->>userId", userId)
    .limit(1)
    .maybeSingle();

  if (dedupeError) {
    // Best-effort pre-check: log and proceed — the 00097 unique index is
    // the authoritative guard (23505 below).
    logger.warn("[SubscriptionExpiringProducer] dedupe pre-check failed", {
      subscriptionId: shortId(subscription.id),
      userId: shortId(userId),
      error: dedupeError.message,
    });
  }

  // Per-recipient day bucket: any existing row for this
  // (subscription, day, recipient) — including failed rows — blocks
  // re-enqueue. Tomorrow's bucket reminds again (countdown cadence).
  if (existingQueue) {
    return { userId, status: "skipped", reason: "duplicate_whatsapp_reminder" };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "subscription_expiring",
    status: "queued",
    data: {
      // The normalized (digits-only) form, not the raw profile value.
      recipient: formattedPhone,
      user_id: userId,
      // Camel-case duplicate of user_id: the day-bucket dedupe filter and
      // the 00097 index key on data->>'userId'.
      userId,
      groupId: subscription.group_id,
      subscriptionId: subscription.id,
      reminderDate,
      daysLeft,
      whatsappType: "subscription_expiring",
      whatsappData: {
        planName: vars.planName,
        days: vars.days,
      },
      template: WA_TEMPLATES.SUBSCRIPTION_EXPIRING,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return { userId, status: "skipped", reason: "duplicate_whatsapp_reminder" };
    }
    logger.warn("[SubscriptionExpiringProducer] WhatsApp reminder queue failed", {
      subscriptionId: shortId(subscription.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return { userId, status: "error", reason: "whatsapp_queue_failed" };
  }

  logger.log("[SubscriptionExpiringProducer] WhatsApp reminder queued", {
    subscriptionId: shortId(subscription.id),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.SUBSCRIPTION_EXPIRING,
    reminderDate,
  });

  return { userId, status: "queued" };
}
