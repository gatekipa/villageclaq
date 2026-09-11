/**
 * Client-side trigger for POST /api/minutes/published-notifications.
 * Fire-and-forget: publish flows must never block on queue enqueue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestMinutesPublishedNotifications(
  supabase: SupabaseClient,
  minutesId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!minutesId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch("/api/minutes/published-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ minutesId, ...(locale ? { locale } : {}) }),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn("[Minutes] published-notifications returned", res.status);
        }
      })
      .catch((err) => {
        console.warn("[Minutes] published-notifications request failed:", err);
      });
  } catch (err) {
    console.warn("[Minutes] published-notifications request failed:", err);
  }
}
