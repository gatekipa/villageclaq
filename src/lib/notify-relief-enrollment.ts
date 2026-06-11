/**
 * Client-side trigger for the server-side WhatsApp relief-enrollment
 * producer. Fire-and-forget: enrollment flows must never block on
 * notification delivery.
 *
 * The server route (/api/relief/enrollment-notifications) authorizes the
 * caller (group owner/admin), re-checks relief_updates preferences and
 * phone eligibility per enrollee, and enqueues at most one WhatsApp
 * notice per enrollment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Must not exceed the route's MAX_BATCH — larger arrays are chunked so a
// big roster/group never silently loses its notices to a 400.
const CHUNK_SIZE = 100;

export async function requestReliefEnrollmentWhatsApp(
  supabase: SupabaseClient,
  enrollmentIds: string[] | null | undefined,
  locale?: string,
): Promise<void> {
  if (!enrollmentIds || enrollmentIds.length === 0) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    for (let i = 0; i < enrollmentIds.length; i += CHUNK_SIZE) {
      const chunk = enrollmentIds.slice(i, i + CHUNK_SIZE);
      fetch("/api/relief/enrollment-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ enrollmentIds: chunk, ...(locale ? { locale } : {}) }),
        keepalive: true,
      })
        .then((res) => {
          if (!res.ok) {
            console.warn("[WhatsApp] relief enrollment notification returned", res.status);
          }
        })
        .catch((err) => {
          console.warn("[WhatsApp] relief enrollment notification request failed:", err);
        });
    }
  } catch (err) {
    console.warn("[WhatsApp] relief enrollment notification request failed:", err);
  }
}
