import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { dispatchWhatsApp } from "@/lib/whatsapp-dispatcher";
import { getEnabledChannels } from "@/lib/notification-prefs";

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
 *      flow (src/app/[locale]/(dashboard)/dashboard/announcements/
 *      page.tsx :: dispatchAnnouncementNotifications).
 *   2. Dispatch in-app + email + sms + whatsapp on ONLY the channels
 *      the admin saved in the row's channels array — and only to
 *      members whose per-channel preferences allow it.
 *   3. Flip sent_at on success. On failure, leave sent_at NULL so
 *      the next cron run retries the row.
 *
 * Idempotency: the WHERE clause filters sent_at IS NULL, and sent_at
 * is written AFTER dispatch succeeds. Running twice in the same
 * window cannot re-fire a row that was already sent.
 *
 * Processes rows sequentially to avoid hammering SMS/WhatsApp rate
 * limits.
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

      // Mark sent only after dispatch completes. The UPDATE is also
      // gated on sent_at IS NULL so a concurrent run cannot flip it
      // twice.
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
 * Server-side equivalent of dispatchAnnouncementNotifications(). Reads
 * the row's audience + channels and dispatches each channel using the
 * existing lib helpers (sendEmail / sendSmsNotification / dispatchWhatsApp).
 * In-app notifications are inserted directly into the notifications table.
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

  // ── Resolve group name (used in email/sms/whatsapp copy) ──
  let groupName = "";
  {
    const { data: groupRow } = await supabase
      .from("groups")
      .select("name")
      .eq("id", groupId)
      .maybeSingle();
    groupName = ((groupRow as Record<string, unknown> | null)?.name as string) || "";
  }

  // ── Recipients per audience ──
  let query = supabase
    .from("memberships")
    .select("id, user_id, role, is_proxy, standing")
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

  // Exclude proxies (no user account) and banned members
  const candidateUserIds = (memberRows || [])
    .filter((m) => {
      const row = m as Record<string, unknown>;
      return row.user_id && row.standing !== "banned";
    })
    .map((m) => (m as Record<string, unknown>).user_id as string);

  if (candidateUserIds.length === 0) return;

  // ── Resolve emails + phones once per group ──
  const emailMap = new Map<string, { email: string; locale: string }>();
  const phoneMap = new Map<string, { phone: string; locale: string }>();

  const { data: emailRows } = await supabase.rpc("get_member_emails", { p_group_id: groupId });
  if (Array.isArray(emailRows)) {
    for (const r of emailRows as Array<Record<string, unknown>>) {
      const uid = r.user_id as string | null;
      const email = r.email as string | null;
      const loc = (r.preferred_locale as string) || "en";
      if (uid && email) emailMap.set(uid, { email, locale: loc });
    }
  }

  const { data: phoneRows } = await supabase.rpc("get_member_phones", { p_group_id: groupId });
  if (Array.isArray(phoneRows)) {
    for (const r of phoneRows as Array<Record<string, unknown>>) {
      const uid = r.user_id as string | null;
      const phone = r.phone as string | null;
      const loc = (r.preferred_locale as string) || "en";
      const isProxy = r.is_proxy as boolean;
      if (uid && phone && !isProxy) phoneMap.set(uid, { phone, locale: loc });
    }
  }

  // ── Per-recipient dispatch ──
  const wantInApp = activeChannels.includes("in_app");
  const wantEmail = activeChannels.includes("email");
  const wantSms = activeChannels.includes("sms");
  const wantWhatsapp = activeChannels.includes("whatsapp");

  // Batched in-app inserts. We resolve locale per recipient for the
  // title/body text so members who prefer FR see the FR copy.
  const inAppRows: Array<Record<string, unknown>> = [];

  for (const uid of candidateUserIds) {
    const emailInfo = emailMap.get(uid);
    const phoneInfo = phoneMap.get(uid);
    const prefLocale = (emailInfo?.locale || phoneInfo?.locale || "en") as "en" | "fr";
    const title = prefLocale === "fr" && titleFr ? titleFr : titleEn;
    const body = (prefLocale === "fr" && contentFr ? contentFr : contentEn).slice(0, 200);

    let channels;
    try {
      channels = await getEnabledChannels(supabase, uid, "announcements", groupId);
    } catch {
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

    if (wantEmail && channels.email && emailInfo?.email) {
      try {
        await sendEmail({
          to: emailInfo.email,
          template: "notification",
          data: { title, body, groupName },
          locale: (emailInfo.locale as "en" | "fr") || prefLocale,
        });
      } catch (err) {
        console.warn(
          `[Cron:ScheduledAnnouncements] email failed for ${uid}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (wantSms && channels.sms && phoneInfo?.phone) {
      try {
        await sendSmsNotification({
          to: phoneInfo.phone,
          template: "announcement",
          data: { groupName, title },
          locale: (phoneInfo.locale as "en" | "fr") || prefLocale,
        });
      } catch (err) {
        console.warn(
          `[Cron:ScheduledAnnouncements] sms failed for ${uid}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (wantWhatsapp && channels.whatsapp && phoneInfo?.phone) {
      try {
        await dispatchWhatsApp(
          "announcement",
          phoneInfo.phone,
          (phoneInfo.locale as "en" | "fr") || prefLocale,
          { groupName, title, body },
        );
      } catch (err) {
        console.warn(
          `[Cron:ScheduledAnnouncements] whatsapp failed for ${uid}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Flush in-app rows in 50-row batches
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
