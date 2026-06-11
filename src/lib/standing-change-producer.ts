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
  standing: string | null;
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

// Localized standing labels for the template body. The Meta template
// ({{2}}) is a free-text parameter, so a recipient-locale label is both
// allowed and clearer than the raw English enum the old client path sent.
const STANDING_LABELS: Record<string, { en: string; fr: string }> = {
  good: { en: "Good", fr: "Bon" },
  warning: { en: "Warning", fr: "Avertissement" },
  suspended: { en: "Suspended", fr: "Suspendu" },
  banned: { en: "Banned", fr: "Banni" },
};

export type StandingChangeProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  membershipId: string;
  newStanding?: string;
  changeDate: string;
  whatsappQueued?: boolean;
};

export type StandingChangeProducerOptions = {
  /** UTC day bucket (YYYY-MM-DD). Defaults to today. One WhatsApp notice
   *  per membership per standing value per day — repeated same-day recalcs
   *  and races dedupe, while a later genuine transition to a different
   *  standing still notifies. */
  changeDate?: string;
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "standing_changes",
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

function standingLabel(standing: string, locale: Locale): string {
  const entry = STANDING_LABELS[standing];
  if (!entry) return standing; // tolerate unknown enum values (e.g. transferred)
  return entry[locale];
}

async function resolveRecipientPhone(
  supabase: SupabaseClient,
  membership: MembershipRow,
  profile: ProfileRow | null,
): Promise<string | null> {
  const rowPhone = profile?.phone || membership.phone || null;
  if (rowPhone || !membership.user_id) return rowPhone;

  try {
    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(membership.user_id);
    return user?.phone || null;
  } catch (err) {
    console.warn("[StandingChangeProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
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
 * Queue a WhatsApp standing-change notice for one member.
 *
 * WhatsApp-only producer: the recipient is the affected member only. The
 * authoritative standing is read from the DB (not trusted from the
 * caller). Proxy / unclaimed members are skipped, matching the existing
 * calculate-standing path which returns before notifying when there is no
 * user account.
 *
 * Idempotency is a DAY BUCKET keyed on (membershipId, newStanding,
 * changeDate): repeated same-day recalcs and concurrent races for the
 * same standing dedupe, while a later genuine transition to a different
 * standing still notifies. Backed by migration 00091.
 *
 * This replaces the old inline client send, which passed `newStatus`
 * where the dispatcher reads `newStanding` — producing an empty {{2}}
 * that Meta rejected. The producer builds the correct key by construction.
 */
export async function produceStandingChangeNotification(
  supabase: SupabaseClient,
  membershipId: string,
  options: StandingChangeProducerOptions = {},
): Promise<StandingChangeProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const changeDate = options.changeDate || todayUtc();

  if (!membershipId) {
    return { status: "skipped", reason: "missing_membership_id", membershipId, changeDate };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status,standing",
    "id",
    membershipId,
  );

  if (membershipError) {
    logger.warn("[StandingChangeProducer] membership lookup failed", {
      membershipId: shortId(membershipId),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", membershipId, changeDate };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", membershipId, changeDate };
  }

  // Parity with the existing standing path: no notice for proxy / unclaimed
  // members (they have no user account and were never notified).
  if (!membership.user_id || membership.is_proxy) {
    return { status: "skipped", reason: "no_user_account", membershipId, changeDate };
  }

  const newStanding = membership.standing;
  if (!newStanding) {
    return { status: "skipped", reason: "missing_standing", membershipId, changeDate };
  }

  const userId = membership.user_id;

  const [profileResult, groupResult] = await Promise.all([
    maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", userId),
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", membership.group_id),
  ]);

  if (profileResult.error || groupResult.error) {
    logger.warn("[StandingChangeProducer] related lookup failed", {
      membershipId: shortId(membershipId),
      profileLookupError: profileResult.error?.message,
      groupLookupError: groupResult.error?.message,
    });
    return { status: "error", reason: "related_lookup_failed", membershipId, changeDate };
  }

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller may be an admin, not the member.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const standingDisplay = standingLabel(newStanding, locale);

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName || !standingDisplay) {
    logger.warn("[StandingChangeProducer] missing template data", {
      membershipId: shortId(membershipId),
      hasGroupName: !!groupName,
      hasStanding: !!standingDisplay,
    });
    return { status: "skipped", reason: "missing_template_data", membershipId, changeDate };
  }

  const channels = await getChannels(supabase, userId, "standing_changes", membership.group_id);
  if (!channels.whatsapp) {
    logger.log("[StandingChangeProducer] WhatsApp standing notice skipped", {
      membershipId: shortId(membershipId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", membershipId, newStanding, changeDate };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[StandingChangeProducer] WhatsApp standing notice skipped", {
      membershipId: shortId(membershipId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", membershipId, newStanding, changeDate };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[StandingChangeProducer] WhatsApp standing notice skipped", {
      membershipId: shortId(membershipId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", membershipId, newStanding, changeDate };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "standing_changed")
    .eq("data->>membershipId", membership.id)
    .eq("data->>newStanding", newStanding)
    .eq("data->>changeDate", changeDate)
    .limit(1)
    .maybeSingle();

  // Day-bucket idempotency: any existing row for this membership+standing+day
  // blocks re-enqueue (including failed rows). A later transition to a
  // different standing has a different key and still notifies.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_standing",
      membershipId,
      newStanding,
      changeDate,
      template: WA_TEMPLATES.STANDING_CHANGED,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "standing_changed",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: membership.group_id,
      membershipId: membership.id,
      newStanding,
      changeDate,
      whatsappType: "standing_changed",
      whatsappData: {
        memberName: memberName(membership, profile),
        newStanding: standingDisplay,
        groupName,
      },
      template: WA_TEMPLATES.STANDING_CHANGED,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_standing",
        membershipId,
        newStanding,
        changeDate,
        template: WA_TEMPLATES.STANDING_CHANGED,
      };
    }
    logger.warn("[StandingChangeProducer] WhatsApp standing queue failed", {
      membershipId: shortId(membership.id),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      membershipId,
      newStanding,
      changeDate,
      template: WA_TEMPLATES.STANDING_CHANGED,
    };
  }

  logger.log("[StandingChangeProducer] WhatsApp standing notice queued", {
    membershipId: shortId(membership.id),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.STANDING_CHANGED,
    changeDate,
  });

  return {
    status: "queued",
    membershipId,
    newStanding,
    changeDate,
    template: WA_TEMPLATES.STANDING_CHANGED,
    whatsappQueued: true,
  };
}
