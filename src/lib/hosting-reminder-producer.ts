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
  is_active: boolean | null;
};

type GroupRow = {
  id: string;
  name: string | null;
  is_active: boolean | null;
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

export type HostingReminderProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  assignmentId: string;
  assignedDate?: string;
  whatsappQueued?: boolean;
};

export type HostingReminderProducerOptions = {
  /** UTC day (YYYY-MM-DD). Defaults to today. Used ONLY to skip past
   *  assignments deterministically (plain ISO string compare) — it is
   *  NOT part of the idempotency key. */
  todayDate?: string;
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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mirrors the hosting-reminders cron's DISPLAY date formatting exactly.
 *  Never used for dedup — dedup uses the raw ISO assigned_date. */
function formatHostingDate(assignedDate: string, locale: Locale): string {
  return new Date(assignedDate + "T00:00:00").toLocaleDateString(
    locale === "fr" ? "fr-FR" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
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
    console.warn("[HostingReminderProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
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
 * Queue a WhatsApp hosting reminder for one upcoming assignment.
 *
 * WhatsApp-only producer: the recipient is the assigned member only.
 * Proxy members are INCLUDED (phone from privacy_settings.proxy_phone),
 * matching the hosting-assignment producer. Proxies have no user account,
 * so no preference row can exist — the channel gate fails open for them,
 * preserving the legacy cron's default-channels behavior for proxies.
 *
 * Idempotency is STRICT per entity-instance: exactly one reminder per
 * (assignmentId, assignedDate), ever. Any existing queue row for that
 * pair — including failed rows — blocks re-enqueue; old failed rows are
 * never retried. A rescheduled assignment (new assigned_date) is a new
 * instance and legitimately re-reminds. This replaces the legacy cron's
 * broken dedup, which compared the ISO assigned_date against a
 * locale-FORMATTED date inside the notification body via LIKE — it never
 * matched, so every run inside the 7-day window re-sent the reminder.
 * Dedup here uses the raw ISO assigned_date only; the locale-formatted
 * date is display copy and never participates in dedup. Migration 00097
 * adds the composite partial unique index backstop on
 * (template, data->>assignmentId, data->>assignedDate) — the 23505
 * handler below treats the race as a duplicate skip.
 *
 * The producer re-checks eligibility at produce time (assignment still
 * upcoming, roster + group active, membership active and in the roster's
 * group), so stale or reassigned rows are skipped, not reminded.
 */
export async function produceHostingReminderNotification(
  supabase: SupabaseClient,
  assignmentId: string,
  options: HostingReminderProducerOptions = {},
): Promise<HostingReminderProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const todayDate = options.todayDate || todayUtc();

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
    logger.warn("[HostingReminderProducer] assignment lookup failed", {
      assignmentId: shortId(assignmentId),
      error: assignmentError.message,
    });
    // Transient lookup failures are errors, not skips — they must surface
    // in the cron's failure counters rather than masquerade as benign skips.
    return { status: "error", reason: "assignment_lookup_failed", assignmentId };
  }

  if (!assignment) {
    return { status: "skipped", reason: "assignment_not_found", assignmentId };
  }

  const assignedDate = assignment.assigned_date || undefined;

  if (assignment.status !== "upcoming") {
    return { status: "skipped", reason: "assignment_not_upcoming", assignmentId, assignedDate };
  }

  if (!assignment.assigned_date) {
    return { status: "skipped", reason: "missing_assigned_date", assignmentId };
  }

  // Plain string compare is safe on YYYY-MM-DD ISO dates.
  if (assignment.assigned_date < todayDate) {
    return { status: "skipped", reason: "assignment_in_past", assignmentId, assignedDate };
  }

  const { data: roster, error: rosterError } = await maybeSingle<RosterRow>(
    supabase,
    "hosting_rosters",
    "id,group_id,is_active",
    "id",
    assignment.roster_id,
  );

  if (rosterError) {
    logger.warn("[HostingReminderProducer] roster lookup failed", {
      assignmentId: shortId(assignmentId),
      rosterId: shortId(assignment.roster_id),
      error: rosterError.message,
    });
    return { status: "error", reason: "roster_lookup_failed", assignmentId, assignedDate };
  }

  if (!roster) {
    return { status: "skipped", reason: "roster_not_found", assignmentId, assignedDate };
  }

  if (roster.is_active === false) {
    return { status: "skipped", reason: "roster_inactive", assignmentId, assignedDate };
  }

  const { data: group, error: groupError } = await maybeSingle<GroupRow>(
    supabase,
    "groups",
    "id,name,is_active",
    "id",
    roster.group_id,
  );

  if (groupError) {
    logger.warn("[HostingReminderProducer] group lookup failed", {
      assignmentId: shortId(assignmentId),
      groupId: shortId(roster.group_id),
      error: groupError.message,
    });
    return { status: "error", reason: "group_lookup_failed", assignmentId, assignedDate };
  }

  if (!group) {
    return { status: "skipped", reason: "group_not_found", assignmentId, assignedDate };
  }

  if (group.is_active === false) {
    return { status: "skipped", reason: "group_inactive", assignmentId, assignedDate };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    assignment.membership_id,
  );

  if (membershipError) {
    logger.warn("[HostingReminderProducer] membership lookup failed", {
      assignmentId: shortId(assignmentId),
      membershipId: shortId(assignment.membership_id),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", assignmentId, assignedDate };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", assignmentId, assignedDate };
  }

  // Departed/suspended members keep their assignment rows — never remind them.
  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", assignmentId, assignedDate };
  }

  if (membership.group_id !== roster.group_id) {
    logger.warn("[HostingReminderProducer] assignment membership group mismatch", {
      assignmentId: shortId(assignmentId),
      rosterGroupId: shortId(roster.group_id),
      membershipGroupId: shortId(membership.group_id),
    });
    return { status: "skipped", reason: "assignment_membership_group_mismatch", assignmentId, assignedDate };
  }

  // Profile lookup only for real users — proxies have no profile row.
  let profile: ProfileRow | null = null;
  if (membership.user_id) {
    const { data: profileData, error: profileError } = await maybeSingle<ProfileRow>(
      supabase,
      "profiles",
      "id,full_name,phone,preferred_locale",
      "id",
      membership.user_id,
    );
    if (profileError) {
      logger.warn("[HostingReminderProducer] profile lookup failed", {
        assignmentId: shortId(assignmentId),
        userId: shortId(membership.user_id),
        error: profileError.message,
      });
      return { status: "error", reason: "profile_lookup_failed", assignmentId, assignedDate };
    }
    profile = profileData;
  }

  const groupName = group.name || "";
  // Recipient-first locale: the caller is the cron, not the recipient,
  // so the member's preferred_locale wins.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const hostingDate = formatHostingDate(assignment.assigned_date, locale);
  const resolvedMemberName = memberName(membership, profile);
  const userId = membership.user_id || null;

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!resolvedMemberName || !groupName || !hostingDate) {
    logger.warn("[HostingReminderProducer] missing template data", {
      assignmentId: shortId(assignmentId),
      hasMemberName: !!resolvedMemberName,
      hasGroupName: !!groupName,
      hasHostingDate: !!hostingDate,
    });
    return { status: "skipped", reason: "missing_template_data", assignmentId, assignedDate };
  }

  // Channel gate: real users only. Proxies have no user account, hence no
  // preference rows — fail open (parity with the legacy cron's defaults
  // for proxies).
  if (userId) {
    const channels = await getChannels(supabase, userId, "hosting_reminders", roster.group_id);
    if (!channels.whatsapp) {
      logger.log("[HostingReminderProducer] WhatsApp reminder skipped", {
        assignmentId: shortId(assignmentId),
        userId: shortId(userId),
        reason: "whatsapp_disabled",
      });
      return { status: "skipped", reason: "whatsapp_disabled", assignmentId, assignedDate };
    }
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[HostingReminderProducer] WhatsApp reminder skipped", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", assignmentId, assignedDate };
  }

  // Queue the normalized digits-only phone, matching the event/subscription
  // producers (and the remittance exemplar) rather than the raw row value.
  const formattedPhone = formatPhoneForWhatsApp(recipientPhone);
  if (!formattedPhone) {
    logger.log("[HostingReminderProducer] WhatsApp reminder skipped", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", assignmentId, assignedDate };
  }

  const { data: existingQueue, error: dedupeError } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "hosting_reminder")
    .eq("data->>assignmentId", assignment.id)
    .eq("data->>assignedDate", assignment.assigned_date)
    .limit(1)
    .maybeSingle();

  // A failed pre-check must never pass silently: before migration 00097 is
  // applied it is the only duplicate guard, so leave a trail (rule 11). We
  // still proceed — once 00097 lands, the unique index is the authoritative
  // guard and turns any race into the 23505 duplicate-skip below.
  if (dedupeError) {
    logger.warn("[HostingReminderProducer] dedupe pre-check failed", {
      assignmentId: shortId(assignmentId),
      error: dedupeError.message,
    });
  }

  // Strict exactly-once per (assignment, scheduled date): any existing
  // queue row blocks re-enqueue, including failed rows. A rescheduled
  // assignment carries a new assigned_date and reminds again.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_reminder",
      assignmentId,
      assignedDate,
      template: WA_TEMPLATES.HOSTING_REMINDER,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "hosting_reminder",
    status: "queued",
    data: {
      recipient: formattedPhone,
      user_id: userId,
      groupId: roster.group_id,
      membershipId: membership.id,
      assignmentId: assignment.id,
      rosterId: roster.id,
      assignedDate: assignment.assigned_date,
      whatsappType: "hosting_reminder",
      whatsappData: {
        memberName: resolvedMemberName,
        hostingDate,
        groupName,
      },
      template: WA_TEMPLATES.HOSTING_REMINDER,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_reminder",
        assignmentId,
        assignedDate,
        template: WA_TEMPLATES.HOSTING_REMINDER,
      };
    }
    logger.warn("[HostingReminderProducer] WhatsApp reminder queue failed", {
      assignmentId: shortId(assignmentId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      assignmentId,
      assignedDate,
      template: WA_TEMPLATES.HOSTING_REMINDER,
    };
  }

  logger.log("[HostingReminderProducer] WhatsApp reminder queued", {
    assignmentId: shortId(assignmentId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.HOSTING_REMINDER,
    assignedDate: assignment.assigned_date,
  });

  return {
    status: "queued",
    assignmentId,
    assignedDate,
    template: WA_TEMPLATES.HOSTING_REMINDER,
    whatsappQueued: true,
  };
}
