/**
 * Client-side trigger for the server-side WhatsApp member-invitation
 * producer. Fire-and-forget: invite flows must never block on
 * notification delivery.
 *
 * The route (/api/invitations/whatsapp-notifications) authorizes the
 * caller (inviter, active group owner/admin, or platform staff), re-reads
 * the invitation row server-side, and enqueues at most one WhatsApp
 * notice per invitation per UTC day — so double-clicks dedupe while the
 * resend feature still re-delivers on a later day.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestMemberInvitationWhatsApp(
  supabase: SupabaseClient,
  invitationId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!invitationId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch("/api/invitations/whatsapp-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invitationId, ...(locale ? { locale } : {}) }),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn("[WhatsApp] member invitation notification returned", res.status);
        }
      })
      .catch((err) => {
        console.warn("[WhatsApp] member invitation notification request failed:", err);
      });
  } catch (err) {
    console.warn("[WhatsApp] member invitation notification request failed:", err);
  }
}
