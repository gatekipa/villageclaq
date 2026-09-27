import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeConfirmedReminderDecision,
  type ObligationRow,
} from "@/lib/payment-reminder-producer";
import {
  evaluatePaymentReminderEligibility,
  paymentReminderSettingsFromGroup,
} from "@/lib/payment-reminder-eligibility";

export type PaymentReminderDeliveryRecheck = {
  eligible: boolean;
  reason: string;
  retryable: boolean;
};

export async function recheckPaymentReminderDelivery(
  supabase: SupabaseClient,
  queueItem: Record<string, unknown>,
  at = new Date(),
): Promise<PaymentReminderDeliveryRecheck> {
  if (queueItem.template !== "payment_reminder") return { eligible: true, reason: "not_payment_reminder", retryable: false };
  const data = (queueItem.data as Record<string, unknown> | null) || {};
  const obligationId = typeof data.obligationId === "string" ? data.obligationId : null;
  if (!obligationId) return { eligible: false, reason: "missing_obligation_id", retryable: false };

  const { data: obligation, error: obligationError } = await supabase
    .from("contribution_obligations")
    .select("id,contribution_type_id,membership_id,group_id,amount,amount_paid,currency,due_date,status")
    .eq("id", obligationId)
    .maybeSingle();
  if (obligationError) return { eligible: false, reason: "obligation_lookup_failed", retryable: true };
  if (!obligation) return { eligible: false, reason: "obligation_not_found", retryable: false };

  const [membershipResult, groupResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id,group_id,user_id,is_proxy,membership_status")
      .eq("id", obligation.membership_id)
      .maybeSingle(),
    supabase.from("groups").select("id,settings").eq("id", obligation.group_id).maybeSingle(),
  ]);
  if (membershipResult.error || groupResult.error) {
    return { eligible: false, reason: "related_lookup_failed", retryable: true };
  }
  if (!membershipResult.data || !groupResult.data) {
    return { eligible: false, reason: "related_record_not_found", retryable: false };
  }

  const decision = await computeConfirmedReminderDecision(
    supabase,
    obligation as ObligationRow,
    console,
  );
  if (decision === "error") return { eligible: false, reason: "confirmed_balance_lookup_failed", retryable: true };

  const eligibility = evaluatePaymentReminderEligibility({
    dueDate: obligation.due_date,
    contributionTypeId: obligation.contribution_type_id,
    obligationStatus: obligation.status,
    membershipStatus: membershipResult.data.membership_status,
    userId: membershipResult.data.user_id,
    isProxy: membershipResult.data.is_proxy,
    confirmedRemaining: decision.remaining,
    at,
  }, paymentReminderSettingsFromGroup(groupResult.data.settings as Record<string, unknown> | null));

  if (!decision.eligible) {
    return { eligible: false, reason: decision.suppressed || "obligation_settled_confirmed", retryable: false };
  }
  return { eligible: eligibility.eligible, reason: eligibility.reason, retryable: false };
}
