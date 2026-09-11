/**
 * Client-side trigger for POST /api/announcements/enqueue.
 * Fire-and-forget: send/publish flows must never block on queue enqueue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestAnnouncementEnqueue(
  supabase: SupabaseClient,
  announcementId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!announcementId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch("/api/announcements/enqueue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ announcementId, ...(locale ? { locale } : {}) }),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn("[Announcements] enqueue returned", res.status);
        }
      })
      .catch((err) => {
        console.warn("[Announcements] enqueue request failed:", err);
      });
  } catch (err) {
    console.warn("[Announcements] enqueue request failed:", err);
  }
}
