import { enqueueCut2ProducerChannels, type Cut2ProducerEnqueueSummary } from "@/lib/enqueue-outbound-notification";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
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
 * Enqueue member_invitation ALLOW channels (WhatsApp + email; SMS DENY).
 *
 * Recipients come from the invitation row only: invitations.phone for
 * WhatsApp, invitations.email for email. No caller-controlled destination.
 * The invitee usually has no account, so notification preferences cannot
 * apply. Display fields (invitee name, locale-prefixed accept URL) are
 * rendered at drain time, not here.
 *
 * Skips: non-pending status, expired timestamp, missing email AND phone.
 * Email-only invitations still enqueue email. Phone-only still enqueue
 * WhatsApp. Invalid phone does not block the email channel.
 *
 * Idempotency is the Cut 2 day bucket (invitationId + UTC date): same-day
 * repeats return result=duplicate; a later-day resend inserts again.
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
  const recipientEmail = (invitation.email || "").trim();
  if (!recipientPhone && !recipientEmail) {
    return { status: "skipped", reason: "missing_contact", invitationId, sendDate };
  }

  if (recipientPhone && !formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[MemberInvitationProducer] WhatsApp invitation skipped", {
      invitationId: shortId(invitationId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    if (!recipientEmail) {
      return { status: "skipped", reason: "invalid_phone", invitationId, sendDate };
    }
  }

  const locale = asLocale(options.locale);
  const enq = await enqueueCut2ProducerChannels({
    notificationType: "member_invitation",
    domainObjectId: invitation.id,
    locale,
  }, supabase);
  const queueError = cut2QueueError(enq);

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate",
        invitationId,
        sendDate,
        template: WA_TEMPLATES.MEMBER_INVITATION,
      };
    }
    logger.warn("[MemberInvitationProducer] invitation queue failed", {
      invitationId: shortId(invitationId),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "invitation_queue_failed",
      invitationId,
      sendDate,
      template: WA_TEMPLATES.MEMBER_INVITATION,
    };
  }

  logger.log("[MemberInvitationProducer] invitation queued", {
    invitationId: shortId(invitationId),
    recipient: recipientPhone ? maskPhoneNumber(recipientPhone) : "(email)",
    template: WA_TEMPLATES.MEMBER_INVITATION,
    sendDate,
  });

  return {
    status: "queued",
    invitationId,
    sendDate,
    template: WA_TEMPLATES.MEMBER_INVITATION,
    whatsappQueued: enq.whatsappInserted || enq.anyInserted,
  };
}

function cut2QueueError(enq: Cut2ProducerEnqueueSummary): { message: string; code: string } | null {
  if (enq.failClosed) return { message: enq.results[0]?.error || "fail_closed", code: "CUT2" };
  if (enq.anyDuplicate && !enq.anyInserted) return { message: "duplicate", code: "23505" };
  if (!enq.anyInserted) return { message: "denied", code: "CUT2_DENIED" };
  return null;
}

