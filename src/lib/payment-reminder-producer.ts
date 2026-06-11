import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type ObligationRow = {
  id: string;
  contribution_type_id: string | null;
  membership_id: string;
  group_id: string;
  amount: string | number;
  amount_paid: string | number | null;
  currency: string | null;
  due_date: string | null;
  status: string | null;
};

type MembershipRow = {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string | null;
  is_proxy: boolean | null;
  phone?: string | null;
  privacy_settings: Record<string, unknown> | null;
  membership_status?: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  preferred_locale: string | null;
};

type GroupRow = {
  id: string;
  name: string | null;
};

type ContributionTypeRow = {
  id: string;
  name: string | null;
  name_fr?: string | null;
};

const REMINDABLE_STATUSES = new Set(["pending", "partial", "overdue"]);

export type PaymentReminderProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  obligationId: string;
  reminderDate: string;
  whatsappQueued?: boolean;
};

export type PaymentReminderProducerOptions = {
  /** UTC day bucket (YYYY-MM-DD). Defaults to today. One WhatsApp reminder
   *  per obligation per bucket — same-day reruns are idempotent while the
   *  next scheduled day reminds again, preserving the cron's daily cadence. */
  reminderDate?: string;
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "payment_reminders",
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
  } catch {
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
 * Queue a WhatsApp payment reminder for one overdue obligation.
 *
 * WhatsApp-only producer: the recipient is the obligated member only.
 * Proxy members are intentionally NOT reminded, matching the existing
 * payment-reminders cron behavior (it filters out proxy memberships
 * before any channel fires).
 *
 * Idempotency is a DAY BUCKET, not strict per-entity exactly-once like
 * the receipt/welcome/relief/hosting producers: reminders legitimately
 * repeat on later scheduled days, so any existing queue row for the same
 * (obligationId, reminderDate) blocks re-enqueue — making same-day cron
 * reruns and retries safe — while the next day's run reminds again.
 * Backed by migration 00090's composite partial unique index.
 *
 * The producer re-checks eligibility at produce time (status still
 * remindable, due date passed, balance outstanding), so an obligation
 * paid between the cron's query and this call is skipped. Note: no
 * trigger ever sets status='overdue' in this schema — eligibility must
 * accept pending/partial/overdue, never require 'overdue'.
 */
export async function producePaymentReminderNotification(
  supabase: SupabaseClient,
  obligationId: string,
  options: PaymentReminderProducerOptions = {},
): Promise<PaymentReminderProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const reminderDate = options.reminderDate || todayUtc();

  if (!obligationId) {
    return { status: "skipped", reason: "missing_obligation_id", obligationId, reminderDate };
  }

  const { data: obligation, error: obligationError } = await maybeSingle<ObligationRow>(
    supabase,
    "contribution_obligations",
    "id,contribution_type_id,membership_id,group_id,amount,amount_paid,currency,due_date,status",
    "id",
    obligationId,
  );

  if (obligationError) {
    logger.warn("[PaymentReminderProducer] obligation lookup failed", {
      obligationId: shortId(obligationId),
      error: obligationError.message,
    });
    return { status: "error", reason: "obligation_lookup_failed", obligationId, reminderDate };
  }

  if (!obligation) {
    return { status: "skipped", reason: "obligation_not_found", obligationId, reminderDate };
  }

  if (!obligation.status || !REMINDABLE_STATUSES.has(obligation.status)) {
    return { status: "skipped", reason: "obligation_not_remindable", obligationId, reminderDate };
  }

  if (!obligation.due_date || obligation.due_date >= reminderDate) {
    return { status: "skipped", reason: "obligation_not_due", obligationId, reminderDate };
  }

  const amountDue = Number(obligation.amount) - Number(obligation.amount_paid || 0);
  if (!(amountDue > 0)) {
    return { status: "skipped", reason: "obligation_settled", obligationId, reminderDate };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    obligation.membership_id,
  );

  if (membershipError) {
    logger.warn("[PaymentReminderProducer] membership lookup failed", {
      obligationId: shortId(obligationId),
      membershipId: shortId(obligation.membership_id),
      error: membershipError.message,
    });
    // Transient lookup failures are errors, not skips — they must surface in
    // the cron's failure counters rather than masquerade as benign skips.
    return { status: "error", reason: "membership_lookup_failed", obligationId, reminderDate };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", obligationId, reminderDate };
  }

  // Parity with the cron: proxy members are never reminded.
  if (!membership.user_id || membership.is_proxy) {
    return { status: "skipped", reason: "proxy_membership", obligationId, reminderDate };
  }

  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", obligationId, reminderDate };
  }

  if (membership.group_id !== obligation.group_id) {
    logger.warn("[PaymentReminderProducer] obligation membership group mismatch", {
      obligationId: shortId(obligationId),
      obligationGroupId: shortId(obligation.group_id),
      membershipGroupId: shortId(membership.group_id),
    });
    return { status: "skipped", reason: "obligation_membership_group_mismatch", obligationId, reminderDate };
  }

  const [profileResult, groupResult, typeResult] = await Promise.all([
    maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id),
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", obligation.group_id),
    obligation.contribution_type_id
      ? maybeSingle<ContributionTypeRow>(supabase, "contribution_types", "id,name,name_fr", "id", obligation.contribution_type_id)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller is the cron, not the recipient.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const typeName = locale === "fr" && typeResult.data?.name_fr
    ? typeResult.data.name_fr
    : (typeResult.data?.name || "");
  const amount = formatAmount(amountDue, obligation.currency || "XAF");
  const dueDate = obligation.due_date;
  const userId = membership.user_id;

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!typeName || !groupName || !dueDate) {
    logger.warn("[PaymentReminderProducer] missing template data", {
      obligationId: shortId(obligationId),
      hasTypeName: !!typeName,
      hasGroupName: !!groupName,
      hasDueDate: !!dueDate,
    });
    return { status: "skipped", reason: "missing_template_data", obligationId, reminderDate };
  }

  const channels = await getChannels(supabase, userId, "payment_reminders", obligation.group_id);
  if (!channels.whatsapp) {
    logger.log("[PaymentReminderProducer] WhatsApp reminder skipped", {
      obligationId: shortId(obligationId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", obligationId, reminderDate };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[PaymentReminderProducer] WhatsApp reminder skipped", {
      obligationId: shortId(obligationId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", obligationId, reminderDate };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[PaymentReminderProducer] WhatsApp reminder skipped", {
      obligationId: shortId(obligationId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", obligationId, reminderDate };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "payment_reminder")
    .eq("data->>obligationId", obligation.id)
    .eq("data->>reminderDate", reminderDate)
    .limit(1)
    .maybeSingle();

  // Day-bucket idempotency: any existing row for this obligation+day blocks
  // re-enqueue (including failed rows). Tomorrow's run reminds again.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_reminder",
      obligationId,
      reminderDate,
      template: WA_TEMPLATES.PAYMENT_REMINDER,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "payment_reminder",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: obligation.group_id,
      membershipId: membership.id,
      obligationId: obligation.id,
      reminderDate,
      whatsappType: "payment_reminder",
      whatsappData: {
        memberName: memberName(membership, profile),
        amount,
        contributionType: typeName,
        dueDate,
        groupName,
      },
      template: WA_TEMPLATES.PAYMENT_REMINDER,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_reminder",
        obligationId,
        reminderDate,
        template: WA_TEMPLATES.PAYMENT_REMINDER,
      };
    }
    logger.warn("[PaymentReminderProducer] WhatsApp reminder queue failed", {
      obligationId: shortId(obligationId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      obligationId,
      reminderDate,
      template: WA_TEMPLATES.PAYMENT_REMINDER,
    };
  }

  logger.log("[PaymentReminderProducer] WhatsApp reminder queued", {
    obligationId: shortId(obligationId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.PAYMENT_REMINDER,
    reminderDate,
  });

  return {
    status: "queued",
    obligationId,
    reminderDate,
    template: WA_TEMPLATES.PAYMENT_REMINDER,
    whatsappQueued: true,
  };
}
