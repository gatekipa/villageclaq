import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { getMemberName } from "@/lib/get-member-name";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

type Locale = "en" | "fr";

type Logger = Pick<Console, "log" | "warn">;

type ClaimRow = {
  id: string;
  plan_id: string;
  membership_id: string;
  amount: number | string | null;
  status: string | null;
  review_notes: string | null;
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
  currency: string | null;
};

export type ReliefClaimDecisionProducerResult = {
  status: "queued" | "skipped" | "error";
  reason?: string;
  template?: string;
  claimId: string;
  decision?: string;
  whatsappQueued?: boolean;
};

export type ReliefClaimDecisionProducerOptions = {
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
  } catch (err) {
    console.warn("[ReliefClaimDecisionProducer] auth phone lookup failed:", err instanceof Error ? err.message : err);
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
 * Queue a WhatsApp relief-claim decision notice for the claimant.
 *
 * WhatsApp-only producer covering BOTH decisions: the claim's status is
 * read authoritatively from the DB — `approved` maps to
 * villageclaq_relief_claim_approved (memberName, claimType, amount,
 * groupName) and `denied` maps to villageclaq_relief_claim_denied
 * (memberName, claimType, reason, groupName). Undecided claims skip.
 * The recipient is the claimant only; proxy members are included
 * (privacy_settings.proxy_phone), matching the old client path.
 *
 * relief_claims has no group_id — the group is the PLAN's group, and no
 * membership/plan group-mismatch skip is applied (shared/HQ plans may
 * legitimately differ).
 *
 * A denied claim with an empty review reason (reachable from the plans
 * page) skips as missing_template_data — Meta rejects blank parameters.
 *
 * Idempotency is per (claimId, decision template): a double-click or
 * rerun for the same decision dedupes, while a genuine reversal
 * (approved -> denied or vice versa) still notifies once per decision.
 * Backed by migration 00093.
 */
export async function produceReliefClaimDecisionNotification(
  supabase: SupabaseClient,
  claimId: string,
  options: ReliefClaimDecisionProducerOptions = {},
): Promise<ReliefClaimDecisionProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;

  if (!claimId) {
    return { status: "skipped", reason: "missing_claim_id", claimId };
  }

  const { data: claim, error: claimError } = await maybeSingle<ClaimRow>(
    supabase,
    "relief_claims",
    "id,plan_id,membership_id,amount,status,review_notes",
    "id",
    claimId,
  );

  if (claimError) {
    logger.warn("[ReliefClaimDecisionProducer] claim lookup failed", {
      claimId: shortId(claimId),
      error: claimError.message,
    });
    return { status: "error", reason: "claim_lookup_failed", claimId };
  }

  if (!claim) {
    return { status: "skipped", reason: "claim_not_found", claimId };
  }

  const decision = claim.status === "approved" || claim.status === "denied" ? claim.status : null;
  if (!decision) {
    return { status: "skipped", reason: "claim_not_decided", claimId };
  }

  const templateKey = decision === "approved" ? "relief_claim_approved" : "relief_claim_denied";
  const metaTemplate =
    decision === "approved" ? WA_TEMPLATES.RELIEF_CLAIM_APPROVED : WA_TEMPLATES.RELIEF_CLAIM_DENIED;

  const { data: plan, error: planError } = await maybeSingle<PlanRow>(
    supabase,
    "relief_plans",
    "id,group_id,name,name_fr",
    "id",
    claim.plan_id,
  );

  if (planError || !plan) {
    logger.warn("[ReliefClaimDecisionProducer] plan lookup failed", {
      claimId: shortId(claimId),
      planId: shortId(claim.plan_id),
      error: planError?.message,
    });
    return { status: planError ? "error" : "skipped", reason: planError ? "related_lookup_failed" : "plan_not_found", claimId, decision };
  }

  const { data: membership, error: membershipError } = await maybeSingle<MembershipRow>(
    supabase,
    "memberships",
    "id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status",
    "id",
    claim.membership_id,
  );

  if (membershipError) {
    logger.warn("[ReliefClaimDecisionProducer] membership lookup failed", {
      claimId: shortId(claimId),
      membershipId: shortId(claim.membership_id),
      error: membershipError.message,
    });
    return { status: "error", reason: "membership_lookup_failed", claimId, decision };
  }

  if (!membership) {
    return { status: "skipped", reason: "membership_not_found", claimId, decision };
  }

  if (membership.membership_status && membership.membership_status !== "active") {
    return { status: "skipped", reason: "membership_not_active", claimId, decision };
  }

  const [profileResult, groupResult] = await Promise.all([
    membership.user_id
      ? maybeSingle<ProfileRow>(supabase, "profiles", "id,full_name,phone,preferred_locale", "id", membership.user_id)
      : Promise.resolve({ data: null, error: null } as { data: ProfileRow | null; error: null }),
    maybeSingle<GroupRow>(supabase, "groups", "id,name,currency", "id", plan.group_id),
  ]);

  if (profileResult.error || groupResult.error) {
    logger.warn("[ReliefClaimDecisionProducer] related lookup failed", {
      claimId: shortId(claimId),
      profileLookupError: profileResult.error?.message,
      groupLookupError: groupResult.error?.message,
    });
    return { status: "error", reason: "related_lookup_failed", claimId, decision };
  }

  const profile = profileResult.data;
  const groupName = groupResult.data?.name || "";
  // Recipient-first locale: the caller is the deciding admin, not the claimant.
  const locale = asLocale(profile?.preferred_locale || options.locale);
  const claimType = locale === "fr" && plan.name_fr ? plan.name_fr : (plan.name || "");
  const currency = groupResult.data?.currency || "XAF";
  const amount = formatAmount(Number(claim.amount || 0), currency);
  const reason = (claim.review_notes || "").trim();

  // Meta rejects empty body parameters — never enqueue blank variables.
  // For denied claims the reason is {{3}}; the plans page allows an empty
  // deny reason, which must skip rather than enqueue a blank.
  const decisionVarOk = decision === "approved" ? !!amount : !!reason;
  if (!groupName || !claimType || !decisionVarOk) {
    logger.warn("[ReliefClaimDecisionProducer] missing template data", {
      claimId: shortId(claimId),
      decision,
      hasGroupName: !!groupName,
      hasClaimType: !!claimType,
      hasDecisionVar: decisionVarOk,
    });
    return { status: "skipped", reason: "missing_template_data", claimId, decision };
  }

  const userId = membership.user_id || null;

  const channels = await getChannels(supabase, userId, "relief_updates", plan.group_id);
  if (!channels.whatsapp) {
    logger.log("[ReliefClaimDecisionProducer] WhatsApp claim notice skipped", {
      claimId: shortId(claimId),
      userId: shortId(userId),
      reason: "whatsapp_disabled",
    });
    return { status: "skipped", reason: "whatsapp_disabled", claimId, decision };
  }

  const recipientPhone = await resolveRecipientPhone(supabase, membership, profile);
  if (!recipientPhone) {
    logger.log("[ReliefClaimDecisionProducer] WhatsApp claim notice skipped", {
      claimId: shortId(claimId),
      userId: shortId(userId),
      reason: "missing_phone",
    });
    return { status: "skipped", reason: "missing_phone", claimId, decision };
  }

  if (!formatPhoneForWhatsApp(recipientPhone)) {
    logger.log("[ReliefClaimDecisionProducer] WhatsApp claim notice skipped", {
      claimId: shortId(claimId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      reason: "invalid_phone",
    });
    return { status: "skipped", reason: "invalid_phone", claimId, decision };
  }

  const { data: existingQueue } = await supabase
    .from("notifications_queue")
    .select("id,status")
    .eq("channel", "whatsapp")
    .eq("template", templateKey)
    .eq("data->>claimId", claim.id)
    .limit(1)
    .maybeSingle();

  // Exactly-once per (claim, decision): an existing row for THIS decision
  // template blocks re-enqueue (including failed rows); a reversal to the
  // other decision uses the other template and still notifies.
  if (existingQueue) {
    return {
      status: "skipped",
      reason: "duplicate_whatsapp_claim_decision",
      claimId,
      decision,
      template: metaTemplate,
    };
  }

  const whatsappData =
    decision === "approved"
      ? {
          memberName: memberName(membership, profile),
          claimType,
          amount,
          groupName,
        }
      : {
          memberName: memberName(membership, profile),
          claimType,
          reason,
          groupName,
        };

  const { error: queueError } = await supabase.from("notifications_queue").insert({
    user_id: userId,
    channel: "whatsapp",
    template: templateKey,
    status: "queued",
    data: {
      recipient: recipientPhone,
      user_id: userId,
      groupId: plan.group_id,
      membershipId: membership.id,
      claimId: claim.id,
      planId: plan.id,
      decision,
      whatsappType: templateKey,
      whatsappData,
      template: metaTemplate,
      locale,
    },
  });

  if (queueError) {
    if (queueError.code === "23505") {
      return {
        status: "skipped",
        reason: "duplicate_whatsapp_claim_decision",
        claimId,
        decision,
        template: metaTemplate,
      };
    }
    logger.warn("[ReliefClaimDecisionProducer] WhatsApp claim queue failed", {
      claimId: shortId(claimId),
      userId: shortId(userId),
      recipient: maskPhoneNumber(recipientPhone),
      error: queueError.message,
    });
    return {
      status: "error",
      reason: "whatsapp_queue_failed",
      claimId,
      decision,
      template: metaTemplate,
    };
  }

  logger.log("[ReliefClaimDecisionProducer] WhatsApp claim notice queued", {
    claimId: shortId(claimId),
    userId: shortId(userId),
    recipient: maskPhoneNumber(recipientPhone),
    template: metaTemplate,
    decision,
  });

  return {
    status: "queued",
    claimId,
    decision,
    template: metaTemplate,
    whatsappQueued: true,
  };
}
