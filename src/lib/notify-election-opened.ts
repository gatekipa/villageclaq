/**
 * Client-side trigger for POST /api/elections/opened-notifications.
 * Fire-and-forget: election-open flows must never block on queue enqueue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestElectionOpenedNotifications(
  supabase: SupabaseClient,
  electionId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!electionId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch("/api/elections/opened-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ electionId, ...(locale ? { locale } : {}) }),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn("[Elections] opened-notifications returned", res.status);
        }
      })
      .catch((err) => {
        console.warn("[Elections] opened-notifications request failed:", err);
      });
  } catch (err) {
    console.warn("[Elections] opened-notifications request failed:", err);
  }
}
