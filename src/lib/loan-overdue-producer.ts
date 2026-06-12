import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { getDateLocale } from "@/lib/date-utils";
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
  currency: string | null;
  status: string | null;
};

type InstallmentRow = {
  id: string;
  due_date: string;
  amount_due: number | string | null;
  amount_paid: number | string | null;
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

// Unpaid installment states. The `overdue` flag is only ever set lazily by
// the client-side markOverdueInstallments on page visits, so eligibility
// must NEVER require it (same pitfall as contribution obligations — see
// payment-reminder-producer).
const UNPAID_STATUSES = ["pending", "partial", "overdue"];

export type LoanOverdueProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  loanId: string;
  reminderDate: string;
  whatsappQueued?: boolean;
};

export type LoanOverdueProducerOptions = {
  /** UTC day bucket (YYYY-MM-DD). Defaults to today. One WhatsApp
   *  reminder per loan per day, mirroring the payment reminder cadence. */
  reminderDate?: string;
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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
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
    console.warn("[LoanOverdueProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
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
 * Queue a WhatsApp overdue-loan reminder for the borrower.
 *
 * WhatsApp-only producer (no loan-overdue email/SMS exists; the in-app
 * notice stays with the client-side markOverdueInstallments path).
 * Eligibility is re-read at produce time: the loan must be `repaying`
 * (defaulted/written_off/completed borrowers are never nagged) and have
 * at least one unpaid installment past the reminder date. The message
 * quotes the EARLIEST overdue installment's outstanding amount and due
 * date — the template body is singular ("your loan repayment of {{2}}
 * was due on {{3}}").
 *
 * Proxy borrowers are included (privacy_settings.proxy_phone), matching
 * the fine/loan/relief money-path family — WhatsApp is the only channel
 * that can reach them.
 *
 * Idempotency is a DAY BUCKET on (loanId, reminderDate): one reminder
 * per loan per UTC day regardless of how many installments are overdue,
 * with cron reruns and races deduped. Backed by migration 00094.
 */
export async function produceLoanOverdueNotification(
  supabase: SupabaseClient,
  loanId: string,
  options: LoanOverdueProducerOptions = {},
): Promise<LoanOverdueProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const reminderDate = options.reminderDate || todayUtc();

  if (!loanId) {
    return { status: "skipped", reason: "missing_loan_id", loanId, reminderDate };
  }

  const { data: loan, error: loanError } = await maybeSingle<LoanRow>(
    supabase,
    "loans",
    "id,group_id,membership_id,currency,status",
    "id",
    loanId,
  );

  if (loanError) {
    logger.warn("[LoanOverdueProducer] loan lookup failed", {
      loanId: shortId(loanId),
      error: loanError.message,
    });
    return { status: "error", reason: "loan_lookup_failed", loanId, reminderDate };
  }

  if (!loan) {
    return { status: "skipped", reason: "loan_not_found", loanId, reminderDate };
  }

  if (loan.status !== "repaying") {
    return { status: "skipped", reason: "loan_not_repaying", loanId, reminderDate };
  }

  // Earliest unpaid installment past the reminder date, re-read at produce
  // time so an installment paid since the cron query never reminds. App
  // flows flip fully-paid rows to status "paid", so any row here should
  // have an outstanding balance; the limit (= the default max repayment
  // term) plus the find() below tolerate drifted data where a row's
  // amounts were settled without flipping its status.
  const { data: installments, error: installmentError } = await supabase
    .from("loan_schedule")
    .select("id,due_date,amount_due,amount_paid,status")
    .eq("loan_id", loan.id)
    .in("status", UNPAID_STATUSES)
    .lt("due_date", reminderDate)
    .order("due_date", { ascending: true })
    .limit(12);

  if (installmentError) {
    logger.warn("[LoanOverdueProducer] installment lookup failed", {
      loanId: shortId(loanId),
      error: installmentError.message,
    });
    return { status: "error", reason: "installment_lookup_failed", loanId, reminderDate };
  }

  const overdueInstallment = ((installments || []) as InstallmentRow[]).find(
    (row) => Number(row.amount_due || 0) - Number(row.amount_paid || 0) > 0,
  );

  if (!overdueInstallment) {
    return { status: "skipped", reason: "no_overdue_installment", loanId, reminderDate };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    loan.membership_id,
  );

  if (membershipError) {
    logger.warn("[LoanOverdueProducer] membership lookup failed", {
      loanId: shortId(loanId),
      membershipId: shortId(loan.membership_id),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", loanId, reminderDate };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", loanId, reminderDate };
  }

  if (membership.group_id !== loan.group_id) {
    return { status: "skipped", reason: "loan_membership_group_mismatch", loanId, reminderDate };
  }

  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", loanId, reminderDate };
  }

  const [profileResult, groupResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null } as { data: ProfileRow | null; error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name,currency", "id", loan.group_id),
  ]);

  if (profileResult.error || groupResult.error) {
    logger.warn("[LoanOverdueProducer] related lookup failed", {
      loanId: shortId(loanId),
      profileLookupError: profileResult.error?.message,
      groupLookupError: groupResult.error?.message,
    });
    return { status: "error", reason: "related_lookup_failed", loanId, reminderDate };
  }

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller is the cron, not the borrower.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const currency = loan.currency || groupResult.data?.currency || "XAF";
  const outstanding =
    Number(overdueInstallment.amount_due || 0) - Number(overdueInstallment.amount_paid || 0);
  const amount = outstanding > 0 ? formatAmount(outstanding, currency) : "";
  // The template's {{3}} is member-facing — render the DATE column in the
  // recipient's locale (UTC pinned so the calendar day never shifts).
  const dueDate = overdueInstallment.due_date
    ? new Date(`${overdueInstallment.due_date}T00:00:00Z`).toLocaleDateString(getDateLocale(locale), {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";

  // Meta rejects empty body parameters — never enqueue blank variables.
  if (!groupName || !amount || !dueDate) {
    logger.warn("[LoanOverdueProducer] missing template data", {
      loanId: shortId(loanId),
      hasGroupName: !!groupName,
      hasAmount: !!amount,
      hasDueDate: !!dueDate,
    });
    return { status: "skipped", reason: "missing_template_data", loanId, reminderDate };
  }

  const userId = membership.user_id || null;

  const channels = await getChannels(supabase, userId, "loan_updates", loan.group_id);
  if (!channels.whatsapp) {
    logger.log("[LoanOverdueProducer] WhatsApp overdue reminder skipped", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", loanId, reminderDate };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[LoanOverdueProducer] WhatsApp overdue reminder skipped", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", loanId, reminderDate };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[LoanOverdueProducer] WhatsApp overdue reminder skipped", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", loanId, reminderDate };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", "loan_overdue")
    .eq("data->>loanId", loan.id)
    .eq("data->>reminderDate", reminderDate)
    .limit(1)
    .maybeSingle();

  // Day-bucket idempotency: one reminder per loan per UTC day; tomorrow's
  // cron run reminds again while the loan stays overdue.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_overdue",
      loanId,
      reminderDate,
      template: WA_TEMPLATES.LOAN_OVERDUE,
    };
  }

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: "loan_overdue",
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: loan.group_id,
      membershipId: membership.id,
      loanId: loan.id,
      installmentId: overdueInstallment.id,
      reminderDate,
      whatsappType: "loan_overdue",
      whatsappData: {
        memberName: memberName(membership, profile),
        amount,
        dueDate,
        groupName,
      },
      template: WA_TEMPLATES.LOAN_OVERDUE,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_overdue",
        loanId,
        reminderDate,
        template: WA_TEMPLATES.LOAN_OVERDUE,
      };
    }
    logger.warn("[LoanOverdueProducer] WhatsApp overdue queue failed", {
      loanId: shortId(loanId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      loanId,
      reminderDate,
      template: WA_TEMPLATES.LOAN_OVERDUE,
    };
  }

  logger.log("[LoanOverdueProducer] WhatsApp overdue reminder queued", {
    loanId: shortId(loanId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: WA_TEMPLATES.LOAN_OVERDUE,
    reminderDate,
  });

  return {
    status: "queued",
    loanId,
    reminderDate,
    template: WA_TEMPLATES.LOAN_OVERDUE,
    whatsappQueued: true,
  };
}
