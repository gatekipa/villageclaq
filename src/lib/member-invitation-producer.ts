import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type InvitationRow = {
  id: string;
  group_id: string;
  invited_by: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  expires_at: string | null;
  claim_membership_id: string | null;
};

type GroupRow = {
  id: string;
  name: string | null;
};

type MembershipRow = {
  id: string;
  display_name: string | null;
  user_id: string | null;
  privacy_settings: Record<string, unknown> | null;
};

// The invitee has no account yet, so there is no profile to localize
// against — the fallback label follows the inviter's UI locale.
const INVITEE_FALLBACK: Record<Locale, string> = {
  en: "Member",
  fr: "Membre",
};

export type MemberInvitationProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  invitationId: string;
  sendDate: string;
  whatsappQueued?: boolean;
};

export type MemberInvitationProducerOptions = {
  /** UTC day bucket (YYYY-MM-DD). Defaults to today. One WhatsApp per
   *  invitation per day: same-day double-clicks and races dedupe, while
   *  the existing resend feature still re-delivers on a later day. */
  sendDate?: string;
  locale?: string;
  logger?: Logger;
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
 * Queue a WhatsApp invitation notice for one phone invitee.
 *
 * WhatsApp-only producer for the NEW villageclaq_member_invitation_notice
 * UTILITY template ({{1}} inviteeName, {{2}} groupName,
 * {{3}} invitationLink) — never the MARKETING-categorized
 * villageclaq_invitation, whose {{1}} was the inviter.
 *
 * The recipient is the invitee phone on the invitation row only. The
 * invitee usually has no account, so notification preferences cannot
 * apply (matching the email leg, which is always sent); the invitee name
 * is the claim-target membership's name for proxy-claim invitations and
 * a localized fallback label otherwise; the locale is the inviter's UI
 * locale (no recipient data exists to do better — documented).
 *
 * Skips: non-pending status (accepted/declined/revoked/expired), expired
 * by timestamp, missing/invalid phone. The invitation link is rebuilt
 * server-side with the same /login?redirectTo=/dashboard/my-invitations
 * path the email leg uses (CLAUDE.md rule 12).
 *
 * Idempotency is a DAY BUCKET on (invitationId, sendDate): same-day
 * repeats dedupe; the existing resend button re-delivers on a later day.
 * Backed by migration 00094.
 */
export async function produceMemberInvitationNotification(
  supabase: SupabaseClient,
  invitationId: string,
  options: MemberInvitationProducerOptions = {},
): Promise<MemberInvitationProducerResult> {
  const logger = options.logger || console;
  const sendDate = options.sendDate || todayUtc();

  if (!invitationId) {
    return { status: "skipped", reason: "missing_invitation_id", invitationId, sendDate };
  }

  const { data: invitation, error: invitationError } = await maybeSingle<InvitationRow>(
    supabase,
    "invitations",
    "id,group_id,invited_by,email,phone,status,expires_at,claim_membership_id",
    "id",
    invitationId,
  );

  if (invitationError) {
    logger.warn("[MemberInvitationProducer] invitation lookup failed", {
      invitationId: shortId(invitationId),
      error: invitationError.message,
    });
    return { status: "error", reason: "invitation_lookup_failed", invitationId, sendDate };
  }

  if (!invitation) {
    return { status: "skipped", reason: "invitation_not_found", invitationId, sendDate };
  }

  if (invitation.status !== "pending") {
    return { status: "skipped", reason: "invitation_not_pending", invitationId, sendDate };
  }

  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { status: "skipped", reason: "invitation_expired", invitationId, sendDate };
  }

  const recipientPhone = (invitation.phone || "").trim();
  if (!recipientPhone) {
    return { status: "skipped", reason: "missing_phone", invitationId, sendDate };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[MemberInvitationProducer] WhatsApp invitation skipped", {
      invitationId: shortId(invitationId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", invitationId, sendDate };
  }

  const [groupResult, claimMembershipResult] = await Promise.all([
    maybeSingle<GroupRow>(supabase, "groups", "id,name", "id", invitation.group_id),
    invitation.claim_membership_id
      ? maybeSingle<MembershipRow>(
          supabase,
          "memberships",
          "id,display_name,user_id,privacy_settings",
          "id",
          invitation.claim_membership_id,
        )
      : Promise.resolve({ data: null, error: null } as { data: MembershipRow | null; error: null }),
  ]);

  if (groupResult.error || claimMembershipResult.error) {
    logger.warn("[MemberInvitationProducer] related lookup failed", {
      invitationId: shortId(invitationId),
      groupLookupError: groupResult.error?.message,
      claimLookupError: claimMembershipResult.error?.message,
    });
    return { status: "error", reason: "related_lookup_failed", invitationId, sendDate };
  }

  const groupName = groupResult.data?.name || "";
  const locale = asLocale(options.locale);
  // Proxy-claim invitations target an existing (proxy) membership whose
  // name we know; plain invitations carry no invitee name — fall back to
  // a localized label so {{1}} is never blank. getMemberName's own
  // "Member" sentinel (blank display_name) also falls through to the
  // localized label so FR messages never carry the English fallback.
  const claimName = claimMembershipResult.data
    ? getMemberName(claimMembershipResult.data as Record<string, unknown>)
    : null;
  const inviteeName = claimName && claimName !== "Member" ? claimName : INVITEE_FALLBACK[locale];
  // Same destination as the invitation email (CLAUDE.md rule 12:
  // /login?redirectTo=/dashboard/my-invitations, locale-prefixed).
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com").replace(/\/$/, "");
  const invitationLink = `${appUrl}/${locale}/login?redirectTo=/dashboard/my-invitations`;

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName || !inviteeName) {
    logger.warn("[MemberInvitationProducer] missing template data", {
      invitationId: shortId(invitationId),
      hasGroupName: !!groupName,
      hasInviteeName: !!inviteeName,
    });
    return { status: "skipped", reason: "missing_template_data", invitationId, sendDate };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "member_invitation")
    .eq("data->>invitationId", invitation.id)
    .eq("data->>sendDate", sendDate)
    .limit(1)
    .maybeSingle();

  // Day-bucket idempotency: same-day repeats (double-click, races) dedupe;
  // a deliberate resend on a later day has a different key and delivers.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_invitation",
      invitationId,
      sendDate,
      template: WA_TEMPLATES.MEMBER_INVITATION,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    // The invitee has no account yet; claim invitations target proxy
    // memberships whose user_id is null by definition.
    user_id: null,
    channel: "whatsapp",
    template: "member_invitation",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: null,
      groupId: invitation.group_id,
      invitationId: invitation.id,
      sendDate,
      whatsappType: "member_invitation",
      whatsappData: {
        inviteeName,
        groupName,
        invitationLink,
      },
      template: WA_TEMPLATES.MEMBER_INVITATION,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_invitation",
        invitationId,
        sendDate,
        template: WA_TEMPLATES.MEMBER_INVITATION,
      };
    }
    logger.warn("[MemberInvitationProducer] WhatsApp invitation queue failed", {
      invitationId: shortId(invitationId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      invitationId,
      sendDate,
      template: WA_TEMPLATES.MEMBER_INVITATION,
    };
  }

  logger.log("[MemberInvitationProducer] WhatsApp invitation queued", {
    invitationId: shortId(invitationId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.MEMBER_INVITATION,
    sendDate,
  });

  return {
    status: "queued",
    invitationId,
    sendDate,
    template: WA_TEMPLATES.MEMBER_INVITATION,
    whatsappQueued: true,
  };
}
