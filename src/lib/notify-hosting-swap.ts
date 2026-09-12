/**
 * Client-side trigger for POST /api/hosting/swap-notifications.
 * Fire-and-forget: swap request/approve/reject must never block on enqueue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestHostingSwapNotifications(
  supabase: SupabaseClient,
  swapRequestId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!swapRequestId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch("/api/hosting/swap-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ swapRequestId, ...(locale ? { locale } : {}) }),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn("[Hosting] swap-notifications returned", res.status);
        }
      })
      .catch((err) => {
        console.warn("[Hosting] swap-notifications request failed:", err);
      });
  } catch (err) {
    console.warn("[Hosting] swap-notifications request failed:", err);
  }
}
