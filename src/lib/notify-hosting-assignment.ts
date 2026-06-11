/**
 * Client-side trigger for the server-side WhatsApp hosting-assignment
 * producer. Fire-and-forget: hosting flows must never block on
 * notification delivery.
 *
 * The server route (/api/hosting/assignment-notifications) authorizes
 * the caller (group owner/admin), re-checks hosting_reminders
 * preferences and phone eligibility per assignee, and enqueues at most
 * one WhatsApp notice per assignment (only `upcoming`, non-past rows).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Must not exceed the route's MAX_BATCH — larger arrays are chunked so a
// long published roster never silently loses its notices to a 400.
const CHUNK_SIZE = 100;

export async function requestHostingAssignmentWhatsApp(
  supabase: SupabaseClient,
  assignmentIds: string[] | null | undefined,
  locale?: string,
): Promise<void> {
  if (!assignmentIds || assignmentIds.length === 0) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    for (let i = 0; i < assignmentIds.length; i += CHUNK_SIZE) {
      const chunk = assignmentIds.slice(i, i + CHUNK_SIZE);
      fetch("/api/hosting/assignment-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ assignmentIds: chunk, ...(locale ? { locale } : {}) }),
        keepalive: true,
      })
        .then((res) => {
          if (!res.ok) {
            console.warn("[WhatsApp] hosting assignment notification returned", res.status);
          }
        })
        .catch((err) => {
          console.warn("[WhatsApp] hosting assignment notification request failed:", err);
        });
    }
  } catch (err) {
    console.warn("[WhatsApp] hosting assignment notification request failed:", err);
  }
}
