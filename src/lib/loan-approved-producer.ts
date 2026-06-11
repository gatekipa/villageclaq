import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type LoanRow = {
  id: string;
  group_id: string;
  membership_id: string;
  amount_requested: number | string | null;
  amount_approved: number | string | null;
  currency: string | null;
  status: string | null;
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

// The approval notice is valid for any post-approval state: the standard
// flow jumps approved -> repaying, and a stale trigger arriving after
// disbursement must not be dropped.
const APPROVED_STATUSES = new Set(["approved", "disbursed", "repaying"]);

export type LoanApprovedProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  loanId: string;
  whatsappQueued?: boolean;
};

export type LoanApprovedProducerOptions = {
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "loan_updates",
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
    console.warn("[LoanApprovedProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
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
 * Queue a WhatsApp loan-approval notice for the borrower.
 *
 * WhatsApp-only producer: the recipient is the borrower only — never the
 * guarantor or admins. The approval state and amount are read
 * authoritatively from the DB (a stale trigger after a denial skips).
 * Proxy members are included (phone from privacy_settings.proxy_phone),
 * matching the old client path.
 *
 * Exactly-once per loan: a loan is approved once, so any existing queue
 * row for the loanId (including failed rows) blocks re-enqueue — this
 * also collapses the two-admin concurrent-approval race the old direct
 * path double-sent on. Backed by migration 00093.
 */
export async function produceLoanApprovedNotification(
  supabase: SupabaseClient,
  loanId: string,
  options: LoanApprovedProducerOptions = {},
): Promise<LoanApprovedProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!loanId) {
    return { status: "skipped", reason: "missing_loan_id", loanId };
  }

  const { data: loan, error: loanError } = await maybeSingle<LoanRow>(
    supabase,
    "loans",
    "id,group_id,membership_id,amount_requested,amount_approved,currency,status",
    "id",
    loanId,
  );

  if (loanError) {
    logger.warn("[LoanApprovedProducer] loan lookup failed", {
      loanId: shortId(loanId),
      error: loanError.message,
    });
    return { status: "error", reason: "loan_lookup_failed", loanId };
  }

  if (!loan) {
    return { status: "skipped", reason: "loan_not_found", loanId };
  }

  if (!loan.status || !APPROVED_STATUSES.has(loan.status)) {
    return { status: "skipped", reason: "loan_not_approved", loanId };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    loan.membership_id,
  );

  if (membershipError) {
    logger.warn("[LoanApprovedProducer] membership lookup failed", {
      loanId: shortId(loanId),
      membershipId: shortId(loan.membership_id),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", loanId };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", loanId };
  }

  if (membership.group_id !== loan.group_id) {
    return { status: "skipped", reason: "loan_membership_group_mismatch", loanId };
  }

  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", loanId };
  }

  const [profileResult, groupResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null } as { data: ProfileRow | null; error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name,currency", "id", loan.group_id),
  ]);

  if (profileResult.error || groupResult.error) {
    logger.warn("[LoanApprovedProducer] related lookup failed", {
      loanId: shortId(loanId),
      profileLookupError: profileResult.error?.message,
      groupLookupError: groupResult.error?.message,
    });
    return { status: "error", reason: "related_lookup_failed", loanId };
  }

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller is the approving admin, not the borrower.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const currency = loan.currency || groupResult.data?.currency || "XAF";
  const approvedAmount = Number(loan.amount_approved ?? loan.amount_requested ?? 0);
  const amount = approvedAmount > 0 ? formatAmount(approvedAmount, currency) : "";

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName || !amount) {
    logger.warn("[LoanApprovedProducer] missing template data", {
      loanId: shortId(loanId),
      hasGroupName: !!groupName,
      hasAmount: !!amount,
    });
    return { status: "skipped", reason: "missing_template_data", loanId };
  }

  const userId = membership.user_id || null;

  const channels = await getChannels(supabase, userId, "loan_updates", loan.group_id);
  if (!channels.whatsapp) {
    logger.log("[LoanApprovedProducer] WhatsApp loan notice skipped", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", loanId };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[LoanApprovedProducer] WhatsApp loan notice skipped", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", loanId };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[LoanApprovedProducer] WhatsApp loan notice skipped", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", loanId };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "loan_approved")
    .eq("data->>loanId", loan.id)
    .limit(1)
    .maybeSingle();

  // Strict exactly-once per loan: any existing queue row blocks re-enqueue,
  // including failed rows.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_loan",
      loanId,
      template: WA_TEMPLATES.LOAN_APPROVED,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "loan_approved",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: loan.group_id,
      membershipId: membership.id,
      loanId: loan.id,
      whatsappType: "loan_approved",
      whatsappData: {
        memberName: memberName(membership, profile),
        amount,
        groupName,
      },
      template: WA_TEMPLATES.LOAN_APPROVED,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_loan",
        loanId,
        template: WA_TEMPLATES.LOAN_APPROVED,
      };
    }
    logger.warn("[LoanApprovedProducer] WhatsApp loan queue failed", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      loanId,
      template: WA_TEMPLATES.LOAN_APPROVED,
    };
  }

  logger.log("[LoanApprovedProducer] WhatsApp loan notice queued", {
    loanId: shortId(loanId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.LOAN_APPROVED,
  });

  return {
    status: "queued",
    loanId,
    template: WA_TEMPLATES.LOAN_APPROVED,
    whatsappQueued: true,
  };
}
