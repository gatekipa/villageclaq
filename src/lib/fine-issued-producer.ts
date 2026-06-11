import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type FineRow = {
  id: string;
  group_id: string;
  fine_type_id: string | null;
  membership_id: string;
  amount: number | string | null;
  currency: string | null;
  reason: string | null;
  status: string | null;
};

type FineTypeRow = {
  id: string;
  name: string | null;
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
  currency: string | null;
};

export type FineIssuedProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  fineId: string;
  whatsappQueued?: boolean;
};

export type FineIssuedProducerOptions = {
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "fine_updates",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
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
    console.warn("[FineIssuedProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
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
 * Queue a WhatsApp fine-issued notice for the fined member.
 *
 * WhatsApp-only producer: the recipient is the fined member only. Proxy
 * members are included (phone from privacy_settings.proxy_phone) —
 * matching the old client path, which messaged proxy phones. All five
 * template variables are resolved server-side from the fine row, so the
 * old client-cache blanks (memberName/fineType/groupName "") are
 * impossible. `reason` falls back to "-" exactly like the old path.
 *
 * Exactly-once per fine: a fine is issued once, so any existing queue
 * row for the fineId (including failed rows) blocks re-enqueue. Backed
 * by migration 00093.
 */
export async function produceFineIssuedNotification(
  supabase: SupabaseClient,
  fineId: string,
  options: FineIssuedProducerOptions = {},
): Promise<FineIssuedProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!fineId) {
    return { status: "skipped", reason: "missing_fine_id", fineId };
  }

  const { data: fine, error: fineError } = await maybeSingle<FineRow>(
    supabase,
    "fines",
    "id,group_id,fine_type_id,membership_id,amount,currency,reason,status",
    "id",
    fineId,
  );

  if (fineError) {
    logger.warn("[FineIssuedProducer] fine lookup failed", {
      fineId: shortId(fineId),
      error: fineError.message,
    });
    return { status: "error", reason: "fine_lookup_failed", fineId };
  }

  if (!fine) {
    return { status: "skipped", reason: "fine_not_found", fineId };
  }

  // A fine waived before the notice goes out should not message the member.
  if (fine.status === "waived") {
    return { status: "skipped", reason: "fine_waived", fineId };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    fine.membership_id,
  );

  if (membershipError) {
    logger.warn("[FineIssuedProducer] membership lookup failed", {
      fineId: shortId(fineId),
      membershipId: shortId(fine.membership_id),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", fineId };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", fineId };
  }

  if (membership.group_id !== fine.group_id) {
    return { status: "skipped", reason: "fine_membership_group_mismatch", fineId };
  }

  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", fineId };
  }

  const [profileResult, groupResult, typeResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null } as { data: ProfileRow | null; error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name,currency", "id", fine.group_id),
    fine.fine_type_id
      ? maybeSingle<FineTypeRow>(supabase, "fine_types", "id,name", "id", fine.fine_type_id)
      : Promise.resolve({ data: null, error: null } as { data: FineTypeRow | null; error: null }),
  ]);

  if (profileResult.error || groupResult.error || typeResult.error) {
    logger.warn("[FineIssuedProducer] related lookup failed", {
      fineId: shortId(fineId),
      profileLookupError: profileResult.error?.message,
      groupLookupError: groupResult.error?.message,
      typeLookupError: typeResult.error?.message,
    });
    return { status: "error", reason: "related_lookup_failed", fineId };
  }

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  const fineTypeName = typeResult.data?.name || "";
  // Recipient-first locale: the caller is the issuing admin, not the member.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const currency = fine.currency || groupResult.data?.currency || "XAF";
  const amount = formatAmount(Number(fine.amount || 0), currency);
  // Parity with the old client path: reason falls back to "-" so {{4}}/{{5}}
  // are never blank.
  const reason = (fine.reason || "").trim() || "-";

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName || !fineTypeName) {
    logger.warn("[FineIssuedProducer] missing template data", {
      fineId: shortId(fineId),
      hasGroupName: !!groupName,
      hasFineTypeName: !!fineTypeName,
    });
    return { status: "skipped", reason: "missing_template_data", fineId };
  }

  const userId = membership.user_id || null;

  const channels = await getChannels(supabase, userId, "fine_updates", fine.group_id);
  if (!channels.whatsapp) {
    logger.log("[FineIssuedProducer] WhatsApp fine notice skipped", {
      fineId: shortId(fineId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", fineId };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[FineIssuedProducer] WhatsApp fine notice skipped", {
      fineId: shortId(fineId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", fineId };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[FineIssuedProducer] WhatsApp fine notice skipped", {
      fineId: shortId(fineId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", fineId };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "fine_issued")
    .eq("data->>fineId", fine.id)
    .limit(1)
    .maybeSingle();

  // Strict exactly-once per fine: any existing queue row blocks re-enqueue,
  // including failed rows.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_fine",
      fineId,
      template: WA_TEMPLATES.FINE_ISSUED,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "fine_issued",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: fine.group_id,
      membershipId: membership.id,
      fineId: fine.id,
      whatsappType: "fine_issued",
      // Approved Meta body order: memberName, fineType, amount, groupName,
      // reason (the dispatcher passes these by key; buildFineIssuedParams
      // emits the positional order).
      whatsappData: {
        memberName: memberName(membership, profile),
        fineType: fineTypeName,
        amount,
        groupName,
        reason,
      },
      template: WA_TEMPLATES.FINE_ISSUED,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_fine",
        fineId,
        template: WA_TEMPLATES.FINE_ISSUED,
      };
    }
    logger.warn("[FineIssuedProducer] WhatsApp fine queue failed", {
      fineId: shortId(fineId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      fineId,
      template: WA_TEMPLATES.FINE_ISSUED,
    };
  }

  logger.log("[FineIssuedProducer] WhatsApp fine notice queued", {
    fineId: shortId(fineId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.FINE_ISSUED,
  });

  return {
    status: "queued",
    fineId,
    template: WA_TEMPLATES.FINE_ISSUED,
    whatsappQueued: true,
  };
}
