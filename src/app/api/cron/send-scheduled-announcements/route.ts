import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnabledChannels } from "@/lib/notification-prefs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date().toISOString();

  // First fetch due candidates without locking (to see if there's any work)
  const { data: due, error: fetchErr } = await supabase
    .from("announcements")
    .select("id")
    .is("sent_at", null)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (fetchErr) {
    console.warn("[Cron:ScheduledAnnouncements] fetch failed:", fetchErr.message);
    return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of due) {
    try {
      // ATOMIC CLAIM: Update sent_at to now() where it is still null
      const { data: claimed, error: updateErr } = await supabase
        .from("announcements")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id as string)
        .is("sent_at", null)
        .select("*")
        .single();

      if (updateErr || !claimed) {
        // Someone else claimed it or it was deleted
        continue;
      }

      await dispatchScheduledAnnouncement(supabase, claimed);
      succeeded++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "unknown";
      errors.push(`${row.id}: ${msg}`);
      console.warn(`[Cron:ScheduledAnnouncements] row ${row.id} failed:`, msg);
    }
  }

  return NextResponse.json({
    processed: due.length,
    succeeded,
    failed,
    errors: errors.slice(0, 20),
  });
}

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
    const profiles = membership.profiles as Record<string, unknown> | Array<Record<string, unknown>> | null;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const prefLocale = ((profile?.preferred_locale as string) || "en") === "fr" ? "fr" : "en";
    
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

    const externalChannels = activeChannels.filter(c => c !== "in_app");
    for (const ch of externalChannels) {
      if ((channels as unknown as Record<string, boolean>)[ch]) {
        await supabase.rpc("queue_transactional_notification", {
          p_command: {
            group_id: groupId,
            membership_id: membershipId,
            channel: ch,
            template_key: "announcement_broadcast",
            payload: {
              title,
              body,
              titleFr,
              bodyFr: contentFr,
            },
            idempotency_key: `${announcementId}_${membershipId}_${ch}`
          }
        });
      }
    }
  }

  if (inAppRows.length > 0) {
    for (let i = 0; i < inAppRows.length; i += 50) {
      const batch = inAppRows.slice(i, i + 50);
      await supabase.from("notifications").insert(batch);
    }
  }
}
