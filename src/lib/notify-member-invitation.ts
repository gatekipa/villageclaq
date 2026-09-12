/**
 * Client-side trigger for the server-side member-invitation producer.
 * Enqueues ALLOW channels (WhatsApp + email) from invitation-row authority
 * only — invitations.email / invitations.phone. SMS remains DENY.
 *
 * The route (/api/invitations/whatsapp-notifications) authorizes the
 * caller (inviter, active group owner/admin, or platform staff), re-reads
 * the invitation row server-side, and enqueues at most one notice per
 * channel per invitation per UTC day — so double-clicks dedupe while the
 * resend feature still re-delivers on a later day.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestMemberInvitationWhatsApp(
  supabase: SupabaseClient,
  invitationId: string | null | undefined,
  locale?: string,
): Promise<boolean> {
  if (!invitationId) return false;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    const res = await fetch("/api/invitations/whatsapp-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invitationId, ...(locale ? { locale } : {}) }),
      keepalive: true,
    });
    if (!res.ok) {
      console.warn("[Invitation] member invitation notification returned", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Invitation] member invitation notification request failed:", err);
    return false;
  }
}
