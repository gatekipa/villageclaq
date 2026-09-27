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
};

export async function recheckPaymentReminderDelivery(
  supabase: SupabaseClient,
  queueItem: Record<string, unknown>,
  at = new Date(),
): Promise<PaymentReminderDeliveryRecheck> {
  if (queueItem.template !== "payment_reminder") return { eligible: true, reason: "not_payment_reminder" };
  const data = (queueItem.data as Record<string, unknown> | null) || {};
  const obligationId = typeof data.obligationId === "string" ? data.obligationId : null;
  if (!obligationId) return { eligible: false, reason: "missing_obligation_id" };

  const { data: obligation, error: obligationError } = await supabase
    .from("contribution_obligations")
    .select("id,contribution_type_id,membership_id,group_id,amount,amount_paid,currency,due_date,status")
    .eq("id", obligationId)
    .maybeSingle();
  if (obligationError || !obligation) return { eligible: false, reason: obligationError ? "obligation_lookup_failed" : "obligation_not_found" };

  const [membershipResult, groupResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id,group_id,user_id,is_proxy,membership_status")
      .eq("id", obligation.membership_id)
      .maybeSingle(),
    supabase.from("groups").select("id,settings").eq("id", obligation.group_id).maybeSingle(),
  ]);
  if (membershipResult.error || groupResult.error || !membershipResult.data || !groupResult.data) {
    return { eligible: false, reason: "related_lookup_failed" };
  }

  const decision = await computeConfirmedReminderDecision(
    supabase,
    obligation as ObligationRow,
    console,
  );
  if (decision === "error") return { eligible: false, reason: "confirmed_balance_lookup_failed" };

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
    return { eligible: false, reason: decision.suppressed || "obligation_settled_confirmed" };
  }
  return { eligible: eligibility.eligible, reason: eligibility.reason };
}
