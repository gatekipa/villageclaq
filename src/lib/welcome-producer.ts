import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

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

export type WelcomeProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  membershipId: string;
  whatsappQueued?: boolean;
};

export type WelcomeProducerOptions = {
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "new_member",
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
 * Queue a WhatsApp welcome message for a member who just joined a group
 * (invitation acceptance, proxy claim, or join-code success).
 *
 * WhatsApp-only producer: existing email/SMS/in-app welcome behavior is
 * produced elsewhere and intentionally untouched. The recipient is the
 * joining member only — never other group members or admins.
 *
 * Exactly-once per membership: any existing welcome queue row for the
 * membership (including failed rows) blocks re-enqueue, mirroring the
 * payment receipt producer's strict idempotency.
 */
export async function produceWelcomeNotifications(
  supabase: SupabaseClient,
  membershipId: string,
  options: WelcomeProducerOptions = {},
): Promise<WelcomeProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!membershipId) {
    return { status: "skipped", reason: "missing_membership_id", membershipId };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    membershipId,
  );

  if (membershipError) {
    logger.warn("[WelcomeProducer] membership lookup failed", {
      membershipId: shortId(membershipId),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", membershipId };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", membershipId };
  }

  // Welcome goes to the joining/accepted/claimed member only — they always
  // have a user account by the time the join event fires. Unclaimed proxy
  // rows (admin-created, user_id NULL) never joined themselves, so no
  // unsolicited welcome is sent to them.
  if (!membership.user_id) {
    return { status: "skipped", reason: "no_user_account", membershipId };
  }

  // pending_approval / suspended / archived / exited rows are not a
  // completed join event. Legacy rows may have a NULL status — allow those.
  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", membershipId };
  }

  const [profileResult, groupResult] = await Promise.all([
    maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id),
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", membership.group_id),
  ]);

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  const locale = asLocale(options.locale || profile?.preferred_locale);
  const userId = membership.user_id;

  const channels = await getChannels(supabase, userId, "new_member", membership.group_id);
  if (!channels.whatsapp) {
    logger.log("[WelcomeProducer] WhatsApp welcome skipped", {
      membershipId: shortId(membership.id),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", membershipId };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[WelcomeProducer] WhatsApp welcome skipped", {
      membershipId: shortId(membership.id),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", membershipId };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[WelcomeProducer] WhatsApp welcome skipped", {
      membershipId: shortId(membership.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", membershipId };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "welcome")
    .eq("data->>membershipId", membership.id)
    .limit(1)
    .maybeSingle();

  // Welcomes are strict exactly-once per membership: any existing queue row
  // blocks automatic re-enqueue, including failed rows. Re-accepting an
  // invitation or re-running a claim never produces a second welcome.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_welcome",
      membershipId,
      template: WA_TEMPLATES.WELCOME,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "welcome",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: membership.group_id,
      membershipId: membership.id,
      whatsappType: "welcome",
      whatsappData: {
        memberName: memberName(membership, profile),
        groupName,
      },
      template: WA_TEMPLATES.WELCOME,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_welcome",
        membershipId,
        template: WA_TEMPLATES.WELCOME,
      };
    }
    logger.warn("[WelcomeProducer] WhatsApp welcome queue failed", {
      membershipId: shortId(membership.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      membershipId,
      template: WA_TEMPLATES.WELCOME,
    };
  }

  logger.log("[WelcomeProducer] WhatsApp welcome queued", {
    membershipId: shortId(membership.id),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.WELCOME,
  });

  return {
    status: "queued",
    membershipId,
    template: WA_TEMPLATES.WELCOME,
    whatsappQueued: true,
  };
}
