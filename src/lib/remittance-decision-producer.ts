import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type RemittanceRow = {
  id: string;
  branch_group_id: string;
  relief_plan_id: string;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
};

type AdminMembershipRow = {
  id: string;
  user_id: string | null;
  membership_status: string | null;
};

type ProfileRow = {
  id: string;
  phone: string | null;
  preferred_locale: string | null;
};

type GroupRow = {
  id: string;
  name: string | null;
};

export type RemittanceRecipientResult = {
  userId: string;
  status: "queued" | "skipped" | "error";
  reason?: string;
};

export type RemittanceDecisionProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  remittanceId: string;
  decision?: string;
  whatsappQueued: number;
  recipients: RemittanceRecipientResult[];
};

export type RemittanceDecisionProducerOptions = {
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "relief_updates",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
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
 * Queue WhatsApp remittance-decision notices for the branch admins.
 *
 * A remittance is a branch-to-HQ relief transfer; when HQ confirms or
 * disputes it, the BRANCH group's owner/admins are notified (the people
 * who submitted it). This is the producer family's first multi-recipient
 * producer: one queue row per eligible branch admin, each with the
 * recipient's own preferred locale and relief_updates preference.
 *
 * The decision is read authoritatively from the DB — `confirmed` maps to
 * villageclaq_remittance_confirmed and `disputed` to
 * villageclaq_remittance_disputed (both UTILITY; {{1}} amount,
 * {{2}} branch group name). Pending remittances skip.
 *
 * Proxy admins are EXCLUDED (user_id required), matching the old client
 * path's `.not("user_id","is",null)` filter — parity preserved.
 *
 * Idempotency is per (remittanceId, decision template, recipient): a
 * rerun for the same decision dedupes per admin, while a genuine
 * reversal (confirmed -> disputed) still notifies once per decision.
 * Backed by migration 00096.
 */
export async function produceRemittanceDecisionNotifications(
  supabase: SupabaseClient,
  remittanceId: string,
  options: RemittanceDecisionProducerOptions = {},
): Promise<RemittanceDecisionProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!remittanceId) {
    return { status: "skipped", reason: "missing_remittance_id", remittanceId, whatsappQueued: 0, recipients: [] };
  }

  const { data: remittance, error: remittanceError } = await maybeSingle<RemittanceRow>(
    supabase,
    "relief_remittances",
    "id,branch_group_id,relief_plan_id,amount,currency,status",
    "id",
    remittanceId,
  );

  if (remittanceError) {
    logger.warn("[RemittanceProducer] remittance lookup failed", {
      remittanceId: shortId(remittanceId),
      error: remittanceError.message,
    });
    return { status: "error", reason: "remittance_lookup_failed", remittanceId, whatsappQueued: 0, recipients: [] };
  }

  if (!remittance) {
    return { status: "skipped", reason: "remittance_not_found", remittanceId, whatsappQueued: 0, recipients: [] };
  }

  const decision =
    remittance.status === "confirmed" || remittance.status === "disputed" ? remittance.status : null;
  if (!decision) {
    return { status: "skipped", reason: "remittance_not_decided", remittanceId, whatsappQueued: 0, recipients: [] };
  }

  const templateKey = decision === "confirmed" ? "remittance_confirmed" : "remittance_disputed";
  const metaTemplate =
    decision === "confirmed" ? WA_TEMPLATES.REMITTANCE_CONFIRMED : WA_TEMPLATES.REMITTANCE_DISPUTED;

  const { data: group, error: groupError } = await maybeSingle<GroupRow>(
    supabase,
    "groups",
    "id,name",
    "id",
    remittance.branch_group_id,
  );

  if (groupError) {
    logger.warn("[RemittanceProducer] group lookup failed", {
      remittanceId: shortId(remittanceId),
      error: groupError.message,
    });
    return { status: "error", reason: "related_lookup_failed", remittanceId, decision, whatsappQueued: 0, recipients: [] };
  }

  const groupName = group?.name || "";
  const amount = Number(remittance.amount || 0) > 0
    ? formatAmount(Number(remittance.amount), remittance.currency || "USD")
    : "";

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName || !amount) {
    logger.warn("[RemittanceProducer] missing template data", {
      remittanceId: shortId(remittanceId),
      hasGroupName: !!groupName,
      hasAmount: !!amount,
    });
    return { status: "skipped", reason: "missing_template_data", remittanceId, decision, whatsappQueued: 0, recipients: [] };
  }

  // Recipients: the BRANCH group's active owner/admins with accounts.
  // Proxy admins are excluded (old-path parity: user_id required).
  const { data: admins, error: adminsError } = await supabase
    .from("memberships")
    .select("id,user_id,membership_status")
    .eq("group_id", remittance.branch_group_id)
    .in("role", ["owner", "admin"])
    .eq("membership_status", "active")
    .not("user_id", "is", null);

  if (adminsError) {
    logger.warn("[RemittanceProducer] branch admin lookup failed", {
      remittanceId: shortId(remittanceId),
      error: adminsError.message,
    });
    return { status: "error", reason: "recipient_lookup_failed", remittanceId, decision, whatsappQueued: 0, recipients: [] };
  }

  const recipients: RemittanceRecipientResult[] = [];
  let whatsappQueued = 0;

  for (const admin of (admins || []) as AdminMembershipRow[]) {
    const userId = admin.user_id as string;
    const recipientResult = await produceForRecipient(
      supabase,
      remittance,
      decision,
      templateKey,
      metaTemplate,
      { amount, groupName },
      userId,
      options,
      getChannels,
      logger,
    );
    recipients.push(recipientResult);
    if (recipientResult.status === "queued") whatsappQueued += 1;
  }

  if (recipients.length === 0) {
    return { status: "skipped", reason: "no_recipients", remittanceId, decision, template: metaTemplate, whatsappQueued: 0, recipients };
  }

  const anyQueued = whatsappQueued > 0;
  const anyError = recipients.some((r) => r.status === "error");
  return {
    status: anyQueued ? "queued" : anyError ? "error" : "skipped",
    reason: anyQueued ? undefined : anyError ? "recipient_errors" : "all_recipients_skipped",
    remittanceId,
    decision,
    template: metaTemplate,
    whatsappQueued,
    recipients,
  };
}

async function produceForRecipient(
  supabase: SupabaseClient,
  remittance: RemittanceRow,
  decision: string,
  templateKey: string,
  metaTemplate: string,
  vars: { amount: string; groupName: string },
  userId: string,
  options: RemittanceDecisionProducerOptions,
  getChannels: NonNullable<RemittanceDecisionProducerOptions["getChannels"]>,
  logger: Logger,
): Promise<RemittanceRecipientResult> {
  const { data: profile, error: profileError } = await maybeSingle<ProfileRow>(
    supabase,
    "profiles",
    "id,phone,preferred_locale",
    "id",
    userId,
  );

  if (profileError) {
    logger.warn("[RemittanceProducer] profile lookup failed", {
      remittanceId: shortId(remittance.id),
      userId: shortId(userId),
      error: profileError.message,
    });
    return { userId, status: "error", reason: "profile_lookup_failed" };
  }

  // Recipient-first locale: the caller is the deciding HQ admin, not the
  // branch admin receiving the notice.
  const locale = asLocale(profile?.preferred_locale || options.locale);

  const channels = await getChannels(supabase, userId, "relief_updates", remittance.branch_group_id);
  if (!channels.whatsapp) {
    return { userId, status: "skipped", reason: "whatsapp_disabled" };
  }

  let recipientPhone = profile?.phone || null;
  if (!recipientPhone) {
    try {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserById(userId);
      recipientPhone = user?.phone || null;
    } catch (err) {
      console.warn("[RemittanceProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
    }
  }

  if (!recipientPhone) {
    return { userId, status: "skipped", reason: "missing_phone" };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[RemittanceProducer] WhatsApp remittance notice skipped", {
      remittanceId: shortId(remittance.id),
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
    .eq("template", templateKey)
    .eq("data->>remittanceId", remittance.id)
    .eq("data->>recipientUserId", userId)
    .limit(1)
    .maybeSingle();

  if (dedupeError) {
    // Best-effort pre-check: log and proceed — the 00096 unique index is
    // the authoritative guard (23505 below).
    logger.warn("[RemittanceProducer] dedupe pre-check failed", {
      remittanceId: shortId(remittance.id),
      userId: shortId(userId),
      error: dedupeError.message,
    });
  }

  // Exactly-once per (remittance, decision, recipient): reruns dedupe per
  // admin; a genuine reversal uses the other template and still notifies.
  if (existingQueue) {
    return { userId, status: "skipped", reason: "duplicate_whatsapp_remittance" };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: templateKey,
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      recipientUserId: userId,
      groupId: remittance.branch_group_id,
      remittanceId: remittance.id,
      planId: remittance.relief_plan_id,
      decision,
      whatsappType: templateKey,
      whatsappData: {
        amount: vars.amount,
        groupName: vars.groupName,
      },
      template: metaTemplate,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return { userId, status: "skipped", reason: "duplicate_whatsapp_remittance" };
    }
    logger.warn("[RemittanceProducer] WhatsApp remittance queue failed", {
      remittanceId: shortId(remittance.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return { userId, status: "error", reason: "whatsapp_queue_failed" };
  }

  logger.log("[RemittanceProducer] WhatsApp remittance notice queued", {
    remittanceId: shortId(remittance.id),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: metaTemplate,
    decision,
  });

  return { userId, status: "queued" };
}
