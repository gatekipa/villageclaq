import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type AssignmentRow = {
  id: string;
  roster_id: string;
  membership_id: string;
  assigned_date: string | null;
  status: string | null;
};

type RosterRow = {
  id: string;
  group_id: string;
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

export type HostingAssignmentProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  assignmentId: string;
  whatsappQueued?: boolean;
};

export type HostingAssignmentProducerOptions = {
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "hosting_reminders",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
}

/** Mirrors the hosting-reminders cron's date formatting exactly. */
function formatHostingDate(assignedDate: string, locale: Locale): string {
  return new Date(assignedDate + "T00:00:00").toLocaleDateString(
    locale === "fr" ? "fr-FR" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

function isPastDate(assignedDate: string): boolean {
  // One day of grace: the server clock is UTC, so a same-day assignment
  // created in a western-hemisphere evening must not be skipped as "past".
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return assignedDate < cutoffIso;
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
 * Queue a WhatsApp hosting-assignment notice for one assigned member.
 *
 * WhatsApp-only producer: the recipient is the assigned member only.
 * Proxy members are included (phone from privacy_settings.proxy_phone).
 * Only `upcoming` assignments with a present/future date are notified —
 * exempted/swapped/completed/missed rows and stale past dates are
 * skipped, so re-publishing a roster never sends stale notices.
 *
 * The dispatch template is WA_TEMPLATES.HOSTING_ASSIGNMENT, which maps
 * to the approved villageclaq_hosting_reminder (identical 3-variable
 * body: memberName, hostingDate, groupName). hostingDate is formatted
 * per recipient locale, mirroring the hosting-reminders cron.
 *
 * Exactly-once per assignment: any existing queue row for the
 * assignment (including failed rows) blocks re-enqueue.
 */
export async function produceHostingAssignmentNotifications(
  supabase: SupabaseClient,
  assignmentId: string,
  options: HostingAssignmentProducerOptions = {},
): Promise<HostingAssignmentProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!assignmentId) {
    return { status: "skipped", reason: "missing_assignment_id", assignmentId };
  }

  const { data: assignment, error: assignmentError } = await maybeSingle<AssignmentRow>(
    supabase,
    "hosting_assignments",
    "id,roster_id,membership_id,assigned_date,status",
    "id",
    assignmentId,
  );

  if (assignmentError) {
    logger.warn("[HostingAssignmentProducer] assignment lookup failed", {
      assignmentId: shortId(assignmentId),
      error: assignmentError.message,
    });
    return { status: "error", reason: "assignment_lookup_failed", assignmentId };
  }

  if (!assignment) {
    return { status: "skipped", reason: "assignment_not_found", assignmentId };
  }

  if (assignment.status !== "upcoming") {
    return { status: "skipped", reason: "assignment_not_upcoming", assignmentId };
  }

  if (!assignment.assigned_date) {
    return { status: "skipped", reason: "missing_assigned_date", assignmentId };
  }

  if (isPastDate(assignment.assigned_date)) {
    return { status: "skipped", reason: "assignment_in_past", assignmentId };
  }

  const { data: roster, error: rosterError } = await maybeSingle<RosterRow>(
    supabase,
    "hosting_rosters",
    "id,group_id",
    "id",
    assignment.roster_id,
  );

  if (rosterError || !roster) {
    logger.warn("[HostingAssignmentProducer] roster lookup failed", {
      assignmentId: shortId(assignmentId),
      rosterId: shortId(assignment.roster_id),
      error: rosterError?.message,
    });
    return { status: "skipped", reason: "roster_not_found", assignmentId };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    assignment.membership_id,
  );

  if (membershipError || !membership) {
    logger.warn("[HostingAssignmentProducer] membership lookup failed", {
      assignmentId: shortId(assignmentId),
      membershipId: shortId(assignment.membership_id),
      error: membershipError?.message,
    });
    return { status: "skipped", reason: "membership_not_found", assignmentId };
  }

  if (membership.group_id !== roster.group_id) {
    logger.warn("[HostingAssignmentProducer] assignment membership group mismatch", {
      assignmentId: shortId(assignmentId),
      rosterGroupId: shortId(roster.group_id),
      membershipGroupId: shortId(membership.group_id),
    });
    return { status: "skipped", reason: "assignment_membership_group_mismatch", assignmentId };
  }

  // Departed/suspended members keep their assignment rows — never notify them.
  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", assignmentId };
  }

  const [profileResult, groupResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", roster.group_id),
  ]);

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller here is the assigning ADMIN, not the
  // recipient (unlike the welcome/receipt producers), so the member's
  // preferred_locale wins — mirroring the hosting-reminders cron.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const hostingDate = formatHostingDate(assignment.assigned_date, locale);
  const userId = membership.user_id || null;

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName) {
    logger.warn("[HostingAssignmentProducer] missing template data", {
      assignmentId: shortId(assignmentId),
      hasGroupName: false,
    });
    return { status: "skipped", reason: "missing_template_data", assignmentId };
  }

  const channels = await getChannels(supabase, userId, "hosting_reminders", roster.group_id);
  if (!channels.whatsapp) {
    logger.log("[HostingAssignmentProducer] WhatsApp assignment notice skipped", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", assignmentId };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[HostingAssignmentProducer] WhatsApp assignment notice skipped", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", assignmentId };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[HostingAssignmentProducer] WhatsApp assignment notice skipped", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", assignmentId };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "hosting_assignment")
    .eq("data->>assignmentId", assignment.id)
    .limit(1)
    .maybeSingle();

  // Strict exactly-once per assignment: any existing queue row blocks
  // automatic re-enqueue, including failed rows. Re-publishing a roster
  // never produces a second notice for the same assignment.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_assignment",
      assignmentId,
      template: WA_TEMPLATES.HOSTING_ASSIGNMENT,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "hosting_assignment",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: roster.group_id,
      membershipId: membership.id,
      assignmentId: assignment.id,
      rosterId: roster.id,
      whatsappType: "hosting_assignment",
      whatsappData: {
        memberName: memberName(membership, profile),
        hostingDate,
        groupName,
      },
      template: WA_TEMPLATES.HOSTING_ASSIGNMENT,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_assignment",
        assignmentId,
        template: WA_TEMPLATES.HOSTING_ASSIGNMENT,
      };
    }
    logger.warn("[HostingAssignmentProducer] WhatsApp assignment queue failed", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      assignmentId,
      template: WA_TEMPLATES.HOSTING_ASSIGNMENT,
    };
  }

  logger.log("[HostingAssignmentProducer] WhatsApp assignment notice queued", {
    assignmentId: shortId(assignmentId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.HOSTING_ASSIGNMENT,
  });

  return {
    status: "queued",
    assignmentId,
    template: WA_TEMPLATES.HOSTING_ASSIGNMENT,
    whatsappQueued: true,
  };
}
