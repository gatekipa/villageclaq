import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type PaymentRow = {
  id: string;
  status: string | null;
  group_id: string;
  membership_id: string;
  contribution_type_id: string | null;
  amount: string | number;
  currency: string | null;
  payment_method: string | null;
  reference_number: string | null;
  payment_date: string | null;
  recorded_at: string | null;
  created_at?: string | null;
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

export type PaymentReceiptProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  paymentId: string;
  notificationCreated?: boolean;
  whatsappQueued?: boolean;
};

export type PaymentReceiptProducerOptions = {
  locale?: string;
  appUrl?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "payment_reminders",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

export function paymentReceiptDedupKey(paymentId: string): string {
  return `payment_receipt:${paymentId}`;
}

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
}

function formatReceiptDate(payment: PaymentRow): string {
  if (payment.payment_date) return payment.payment_date;
  const timestamp = payment.recorded_at || payment.created_at;
  if (!timestamp) return new Date().toISOString().slice(0, 10);
  return timestamp.slice(0, 10);
}

function notificationText(locale: Locale, amount: string, typeName: string, method: string, reference: string) {
  if (locale === "fr") {
    return {
      title: `Paiement de ${amount} reçu`,
      body: `Paiement de ${amount} reçu pour ${typeName}. Méthode : ${method}. Référence : ${reference}.`,
    };
  }
  return {
    title: `Payment of ${amount} received`,
    body: `Payment of ${amount} received for ${typeName}. Method: ${method}. Reference: ${reference}.`,
  };
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

export async function producePaymentReceiptNotifications(
  supabase: SupabaseClient,
  paymentId: string,
  options: PaymentReceiptProducerOptions = {},
): Promise<PaymentReceiptProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!paymentId) {
    return { status: "skipped", reason: "missing_payment_id", paymentId };
  }

  const { data: payment, error: paymentError } = await maybeSingle<PaymentRow>(
    supabase,
    "payments",
    "id,status,group_id,membership_id,contribution_type_id,amount,currency,payment_method,reference_number,payment_date,recorded_at,created_at",
    "id",
    paymentId,
  );

  if (paymentError) {
    logger.warn("[PaymentReceiptProducer] payment lookup failed", {
      paymentId: shortId(paymentId),
      error: paymentError.message,
    });
    return { status: "error", reason: "payment_lookup_failed", paymentId };
  }

  if (!payment) {
    return { status: "skipped", reason: "payment_not_found", paymentId };
  }

  if (payment.status !== "confirmed") {
    return { status: "skipped", reason: "payment_not_confirmed", paymentId };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    payment.membership_id,
  );

  if (membershipError || !membership) {
    logger.warn("[PaymentReceiptProducer] membership lookup failed", {
      paymentId: shortId(paymentId),
      membershipId: shortId(payment.membership_id),
      error: membershipError?.message,
    });
    return { status: "skipped", reason: "membership_not_found", paymentId };
  }

  if (membership.group_id !== payment.group_id) {
    logger.warn("[PaymentReceiptProducer] payment membership group mismatch", {
      paymentId: shortId(paymentId),
      paymentGroupId: shortId(payment.group_id),
      membershipGroupId: shortId(membership.group_id),
    });
    return { status: "skipped", reason: "payment_membership_group_mismatch", paymentId };
  }

  const [profileResult, groupResult, typeResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", payment.group_id),
    payment.contribution_type_id
      ? maybeSingle<ContributionTypeRow>(supabase, "contribution_types", "id,name,name_fr", "id", payment.contribution_type_id)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  const locale = asLocale(options.locale || profile?.preferred_locale);
  const typeName = locale === "fr" && typeResult.data?.name_fr
    ? typeResult.data.name_fr
    : (typeResult.data?.name || "");
  const amount = formatAmount(payment.amount, payment.currency || "XAF");
  const method = payment.payment_method || "other";
  const reference = payment.reference_number || "N/A";
  const date = formatReceiptDate(payment);
  const dedupKey = paymentReceiptDedupKey(payment.id);
  const userId = membership.user_id || null;

  let notificationCreated = false;
  if (userId) {
    const { data: existingNotification } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("dedup_key", dedupKey)
      .limit(1)
      .maybeSingle();

    if (!existingNotification) {
      const text = notificationText(locale, amount, typeName, method, reference);
      const { error: insertError } = await supabase.from("notifications").insert({
        user_id: userId,
        group_id: payment.group_id,
        type: "contribution_received",
        title: text.title,
        body: text.body,
        is_read: false,
        dedup_key: dedupKey,
        data: {
          link: "/dashboard/my-payments",
          payment_id: payment.id,
          amount: Number(payment.amount),
          currency: payment.currency || "XAF",
          contribution_type: typeName,
          method,
          reference: payment.reference_number || null,
        },
      });
      if (insertError && insertError.code !== "23505") {
        logger.warn("[PaymentReceiptProducer] in-app receipt insert failed", {
          paymentId: shortId(payment.id),
          userId: shortId(userId),
          error: insertError.message,
        });
      } else {
        notificationCreated = !insertError;
      }
    }
  }

  const channels = await getChannels(supabase, userId, "payment_reminders", payment.group_id);
  if (!channels.whatsapp) {
    logger.log("[PaymentReceiptProducer] WhatsApp receipt skipped", {
      paymentId: shortId(payment.id),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", paymentId, notificationCreated };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[PaymentReceiptProducer] WhatsApp receipt skipped", {
      paymentId: shortId(payment.id),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", paymentId, notificationCreated };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "payment_receipt")
    .eq("data->>paymentId", payment.id)
    .limit(1)
    .maybeSingle();

  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_receipt",
      paymentId,
      template: WA_TEMPLATES.PAYMENT_RECEIPT,
      notificationCreated,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "payment_receipt",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: payment.group_id,
      membershipId: payment.membership_id,
      paymentId: payment.id,
      notificationDedupKey: dedupKey,
      whatsappType: "payment_receipt",
      whatsappData: {
        memberName: memberName(membership, profile),
        amount,
        contributionType: typeName,
        groupName,
        date,
      },
      template: WA_TEMPLATES.PAYMENT_RECEIPT,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_receipt",
        paymentId,
        template: WA_TEMPLATES.PAYMENT_RECEIPT,
        notificationCreated,
      };
    }
    logger.warn("[PaymentReceiptProducer] WhatsApp receipt queue failed", {
      paymentId: shortId(payment.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      paymentId,
      template: WA_TEMPLATES.PAYMENT_RECEIPT,
      notificationCreated,
    };
  }

  logger.log("[PaymentReceiptProducer] WhatsApp receipt queued", {
    paymentId: shortId(payment.id),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.PAYMENT_RECEIPT,
  });

  return {
    status: "queued",
    paymentId,
    template: WA_TEMPLATES.PAYMENT_RECEIPT,
    notificationCreated,
    whatsappQueued: true,
  };
}
