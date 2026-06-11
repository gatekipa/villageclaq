/**
 * Client-side trigger for the server-side WhatsApp welcome producer.
 * Fire-and-forget: join flows must never block on welcome delivery.
 *
 * The server route (/api/members/welcome-notifications) authorizes the
 * caller, re-checks new_member preferences and phone eligibility, and
 * enqueues at most one WhatsApp welcome per membership.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestWelcomeWhatsApp(
  supabase: SupabaseClient,
  membershipId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!membershipId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch("/api/members/welcome-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ membershipId, ...(locale ? { locale } : {}) }),
    }).catch((err) => {
      console.warn("[WhatsApp] welcome notification request failed:", err);
    });
  } catch (err) {
    console.warn("[WhatsApp] welcome notification request failed:", err);
  }
}
