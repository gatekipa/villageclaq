/**
 * Recipient authorisation helpers for /api/email|sms|whatsapp/send.
 *
 * Before these helpers landed, any authenticated user could post to
 * /api/email/send with `to: <any user UUID>` or `<any email>` and
 * trigger a templated message. Combined with no rate limit this was
 * a spam/phishing vector. Callers now must either:
 *   - be platform_staff (operations / broadcast tool), or
 *   - share at least one active group membership with the target user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function isPlatformStaff(
  adminClient: SupabaseClient,
  callerId: string,
): Promise<boolean> {
  try {
    const { data } = await adminClient
      .from("platform_staff")
      .select("id")
      .eq("user_id", callerId)
      .eq("is_active", true)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * True if caller and target share at least one active group membership.
 * Resolves target from either a user UUID or a phone number.
 */
export async function callerCanMessageTarget(
  adminClient: SupabaseClient,
  callerId: string,
  target: { userId?: string | null; phone?: string | null },
): Promise<{ allowed: boolean; reason?: string }> {
  let targetUserId = target.userId || null;

  // Resolve phone → user_id via profiles.phone lookup
  if (!targetUserId && target.phone) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("phone", target.phone)
      .maybeSingle();
    targetUserId = ((profile as Record<string, unknown> | null)?.id as string) || null;
    if (!targetUserId) {
      // Phone not mapped to any user account — e.g. a proxy phone.
      // Fall back to checking via memberships.privacy_settings.proxy_phone.
      const { data: memRows } = await adminClient
        .from("memberships")
        .select("group_id, privacy_settings")
        .eq("privacy_settings->>proxy_phone", target.phone)
        .limit(5);
      const proxyGroupIds = ((memRows || []) as Array<Record<string, unknown>>)
        .map((m) => m.group_id as string);
      if (proxyGroupIds.length === 0) {
        return { allowed: false, reason: "target_not_found" };
      }
      const { data: callerRows } = await adminClient
        .from("memberships")
        .select("id")
        .eq("user_id", callerId)
        .in("group_id", proxyGroupIds)
        .limit(1);
      if ((callerRows || []).length > 0) return { allowed: true };
      return { allowed: false, reason: "no_shared_group" };
    }
  }

  if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
    // No resolvable target (e.g., raw email string) — deny. Legitimate
    // callers pass either a user UUID or a known phone; the email
    // endpoint resolves the email via the service-role auth.users
    // lookup only when the "to" is a UUID.
    return { allowed: false, reason: "target_not_resolvable" };
  }

  if (callerId === targetUserId) {
    return { allowed: true };
  }

  // Shared-group check: caller has any active membership whose group_id
  // is also a group the target is in.
  const { data: shared } = await adminClient.rpc("caller_shares_group_with", {
    p_caller_id: callerId,
    p_target_id: targetUserId,
  });
  if (shared === true) return { allowed: true };

  return { allowed: false, reason: "no_shared_group" };
}
