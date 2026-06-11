import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type EnrollmentRow = {
  id: string;
  plan_id: string;
  membership_id: string;
  is_active: boolean | null;
};

type PlanRow = {
  id: string;
  group_id: string;
  name: string | null;
  name_fr: string | null;
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

export type ReliefEnrollmentProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  enrollmentId: string;
  whatsappQueued?: boolean;
};

export type ReliefEnrollmentProducerOptions = {
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
 * Queue a WhatsApp relief-enrollment notice for one enrolled member.
 *
 * WhatsApp-only producer: the recipient is the enrolled member only —
 * never other group members or admins. Proxy members are included
 * (phone from privacy_settings.proxy_phone), matching the payment
 * receipt producer. Template variables are resolved server-side and
 * are never blank — Meta rejects empty body parameters, which is why
 * the old client path (shared payload, memberName: "") failed.
 *
 * Exactly-once per enrollment: any existing queue row for the
 * enrollment (including failed rows) blocks re-enqueue, mirroring the
 * payment receipt and welcome producers' strict idempotency.
 */
export async function produceReliefEnrollmentNotifications(
  supabase: SupabaseClient,
  enrollmentId: string,
  options: ReliefEnrollmentProducerOptions = {},
): Promise<ReliefEnrollmentProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!enrollmentId) {
    return { status: "skipped", reason: "missing_enrollment_id", enrollmentId };
  }

  const { data: enrollment, error: enrollmentError } = await maybeSingle<EnrollmentRow>(
    supabase,
    "relief_enrollments",
    "id,plan_id,membership_id,is_active",
    "id",
    enrollmentId,
  );

  if (enrollmentError) {
    logger.warn("[ReliefEnrollmentProducer] enrollment lookup failed", {
      enrollmentId: shortId(enrollmentId),
      error: enrollmentError.message,
    });
    return { status: "error", reason: "enrollment_lookup_failed", enrollmentId };
  }

  if (!enrollment) {
    return { status: "skipped", reason: "enrollment_not_found", enrollmentId };
  }

  if (!enrollment.is_active) {
    return { status: "skipped", reason: "enrollment_inactive", enrollmentId };
  }

  const { data: plan, error: planError } = await maybeSingle<PlanRow>(
    supabase,
    "relief_plans",
    "id,group_id,name,name_fr",
    "id",
    enrollment.plan_id,
  );

  if (planError || !plan) {
    logger.warn("[ReliefEnrollmentProducer] plan lookup failed", {
      enrollmentId: shortId(enrollmentId),
      planId: shortId(enrollment.plan_id),
      error: planError?.message,
    });
    return { status: "skipped", reason: "plan_not_found", enrollmentId };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    enrollment.membership_id,
  );

  if (membershipError || !membership) {
    logger.warn("[ReliefEnrollmentProducer] membership lookup failed", {
      enrollmentId: shortId(enrollmentId),
      membershipId: shortId(enrollment.membership_id),
      error: membershipError?.message,
    });
    return { status: "skipped", reason: "membership_not_found", enrollmentId };
  }

  if (membership.group_id !== plan.group_id) {
    logger.warn("[ReliefEnrollmentProducer] enrollment membership group mismatch", {
      enrollmentId: shortId(enrollmentId),
      planGroupId: shortId(plan.group_id),
      membershipGroupId: shortId(membership.group_id),
    });
    return { status: "skipped", reason: "enrollment_membership_group_mismatch", enrollmentId };
  }

  // Departed/suspended members keep their enrollment rows — never notify them.
  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", enrollmentId };
  }

  const [profileResult, groupResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", plan.group_id),
  ]);

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller here is the enrolling ADMIN, not the
  // recipient (unlike the welcome/receipt producers), so the member's
  // preferred_locale wins; options.locale is only the proxy/no-profile fallback.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const planName = locale === "fr" && plan.name_fr ? plan.name_fr : (plan.name || "");
  const userId = membership.user_id || null;

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!planName || !groupName) {
    logger.warn("[ReliefEnrollmentProducer] missing template data", {
      enrollmentId: shortId(enrollmentId),
      hasPlanName: !!planName,
      hasGroupName: !!groupName,
    });
    return { status: "skipped", reason: "missing_template_data", enrollmentId };
  }

  const channels = await getChannels(supabase, userId, "relief_updates", plan.group_id);
  if (!channels.whatsapp) {
    logger.log("[ReliefEnrollmentProducer] WhatsApp enrollment notice skipped", {
      enrollmentId: shortId(enrollmentId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", enrollmentId };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[ReliefEnrollmentProducer] WhatsApp enrollment notice skipped", {
      enrollmentId: shortId(enrollmentId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", enrollmentId };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[ReliefEnrollmentProducer] WhatsApp enrollment notice skipped", {
      enrollmentId: shortId(enrollmentId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", enrollmentId };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "relief_enrollment")
    .eq("data->>enrollmentId", enrollment.id)
    .limit(1)
    .maybeSingle();

  // Strict exactly-once per enrollment: any existing queue row blocks
  // automatic re-enqueue, including failed rows.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_enrollment",
      enrollmentId,
      template: WA_TEMPLATES.RELIEF_ENROLLMENT,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "relief_enrollment",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: plan.group_id,
      membershipId: membership.id,
      enrollmentId: enrollment.id,
      planId: plan.id,
      whatsappType: "relief_enrollment",
      whatsappData: {
        memberName: memberName(membership, profile),
        planName,
        groupName,
      },
      template: WA_TEMPLATES.RELIEF_ENROLLMENT,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_enrollment",
        enrollmentId,
        template: WA_TEMPLATES.RELIEF_ENROLLMENT,
      };
    }
    logger.warn("[ReliefEnrollmentProducer] WhatsApp enrollment queue failed", {
      enrollmentId: shortId(enrollmentId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      enrollmentId,
      template: WA_TEMPLATES.RELIEF_ENROLLMENT,
    };
  }

  logger.log("[ReliefEnrollmentProducer] WhatsApp enrollment notice queued", {
    enrollmentId: shortId(enrollmentId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.RELIEF_ENROLLMENT,
  });

  return {
    status: "queued",
    enrollmentId,
    template: WA_TEMPLATES.RELIEF_ENROLLMENT,
    whatsappQueued: true,
  };
}
