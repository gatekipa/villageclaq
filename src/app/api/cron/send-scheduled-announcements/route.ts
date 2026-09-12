import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnabledChannels } from "@/lib/notification-prefs";
import { enqueueCut2ProducerChannels } from "@/lib/enqueue-outbound-notification";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/send-scheduled-announcements
 * Vercel Cron — runs every 5 minutes.
 *
 * Promotes announcements whose scheduled_at has arrived and that have
 * NOT been sent yet. For each such row we:
 *   1. Fetch recipients per the row's audience JSONB (all / roles /
 *      members), using the same targeting rules as the manual send
 *      flow.
 *   2. Insert in-app notifications. SMS/WA are enqueued via
 *      enqueueCut2ProducerChannels (announcement email is DENY).
 *      No sendEmail / sendSmsNotification / dispatchWhatsApp.
 *      announcement-producer.ts stays DORMANT.
 *   3. Flip sent_at on success. On failure, leave sent_at NULL so
 *      the next cron run retries the row.
 *
 * Qualification/send is dormant (no real provider). Drain is the only
 * sender for queued channels.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date().toISOString();

  const { data: due, error: fetchErr } = await supabase
    .from("announcements")
    .select("id, group_id, title, title_fr, content, content_fr, channels, audience, scheduled_at")
    .is("sent_at", null)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (fetchErr) {
    console.warn("[Cron:ScheduledAnnouncements] fetch failed:", fetchErr.message);
    return NextResponse.json(
      { success: false, error: fetchErr.message, processed: 0, succeeded: 0, failed: 0 },
      { status: 500 },
    );
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of due) {
    try {
      await dispatchScheduledAnnouncement(supabase, row as Record<string, unknown>);

      const { error: updateErr } = await supabase
        .from("announcements")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id as string)
        .is("sent_at", null);
      if (updateErr) {
        failed++;
        errors.push(`${row.id}: update failed: ${updateErr.message}`);
        continue;
      }
      succeeded++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "unknown";
      errors.push(`${row.id}: ${msg}`);
      console.warn(`[Cron:ScheduledAnnouncements] row ${row.id} failed:`, msg);
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[Cron:ScheduledAnnouncements] ${succeeded} sent, ${failed} failed:`,
      errors.slice(0, 10),
    );
  }

  return NextResponse.json({
    processed: due.length,
    succeeded,
    failed,
    errors: errors.slice(0, 20),
  });
}

/**
 * In-app inserts + Cut 2 enqueue per recipient membership.
 * Does not call sendEmail / sendSmsNotification / dispatchWhatsApp.
 * Does not activate announcement-producer.ts.
 */
async function dispatchScheduledAnnouncement(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const announcementId = row.id as string;
  const groupId = row.group_id as string;
  const titleEn = (row.title as string) || "";
  const titleFr = (row.title_fr as string) || "";
  const contentEn = (row.content as string) || "";
  const contentFr = (row.content_fr as string) || "";
  const activeChannels = Array.isArray(row.channels) ? (row.channels as string[]) : ["in_app"];
  const audience = (row.audience as Record<string, unknown> | null) || { type: "all" };
  const audienceType = (audience.type as string) || "all";

  let query = supabase
    .from("memberships")
    .select("id, user_id, role, is_proxy, standing, profiles:profiles!memberships_user_id_fkey(preferred_locale)")
    .eq("group_id", groupId);

  if (audienceType === "roles") {
    const roles = Array.isArray(audience.roles) ? (audience.roles as string[]) : [];
    if (roles.length === 0) return;
    query = query.in("role", roles);
  } else if (audienceType === "members") {
    const members = Array.isArray(audience.members) ? (audience.members as string[]) : [];
    if (members.length === 0) return;
    query = query.in("id", members);
  }

  const { data: memberRows, error: memErr } = await query;
  if (memErr) throw new Error(`membership query failed: ${memErr.message}`);

  const candidates = (memberRows || []).filter((m) => {
    const rec = m as Record<string, unknown>;
    return rec.user_id && rec.standing !== "banned";
  }) as Array<Record<string, unknown>>;

  if (candidates.length === 0) return;

  const wantInApp = activeChannels.includes("in_app");
  const inAppRows: Array<Record<string, unknown>> = [];

  for (const membership of candidates) {
    const uid = membership.user_id as string;
    const membershipId = membership.id as string;
    const profiles = membership.profiles as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const prefLocale = ((profile?.preferred_locale as string) || "en") === "fr" ? "fr" : "en";
    const title = prefLocale === "fr" && titleFr ? titleFr : titleEn;
    const body = (prefLocale === "fr" && contentFr ? contentFr : contentEn).slice(0, 200);

    let channels;
    try {
      channels = await getEnabledChannels(supabase, uid, "announcements", groupId);
    } catch (err) {
      console.warn(
        `[Cron:ScheduledAnnouncements] preference lookup failed for ${uid}:`,
        err instanceof Error ? err.message : err,
      );
      channels = { in_app: true, email: true, sms: true, whatsapp: true, push: false };
    }

    if (wantInApp && channels.in_app) {
      inAppRows.push({
        user_id: uid,
        group_id: groupId,
        type: "announcement",
        title,
        body,
        is_read: false,
        data: { link: `/dashboard/announcements`, announcementId },
      });
    }

    await enqueueCut2ProducerChannels(
      {
        notificationType: "announcement",
        domainObjectId: announcementId,
        recipientMembershipId: membershipId,
        locale: prefLocale,
      },
      supabase,
    );
  }

  if (inAppRows.length > 0) {
    for (let i = 0; i < inAppRows.length; i += 50) {
      const batch = inAppRows.slice(i, i + 50);
      const { error: insertErr } = await supabase.from("notifications").insert(batch);
      if (insertErr) {
        console.warn(
          `[Cron:ScheduledAnnouncements] in-app insert batch failed:`,
          insertErr.message,
        );
      }
    }
  }
}
