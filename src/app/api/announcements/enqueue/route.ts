import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import {
  enqueueCut2ProducerChannels,
  type Cut2ProducerEnqueueSummary,
} from "@/lib/enqueue-outbound-notification";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseLocale(value: unknown): "en" | "fr" | undefined {
  return value === "en" || value === "fr" ? value : undefined;
}

function summarize(results: Cut2ProducerEnqueueSummary[]) {
  let inserted = 0;
  let duplicate = 0;
  let denied = 0;
  let failClosed = 0;
  for (const s of results) {
    for (const r of s.results) {
      if (r.result === "inserted") inserted++;
      else if (r.result === "duplicate") duplicate++;
      else if (r.result === "denied") denied++;
      else if (r.result === "fail_closed") failClosed++;
    }
  }
  return { ok: true, recipients: results.length, inserted, duplicate, denied, failClosed };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
    }

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const announcementId = typeof bodyRecord.announcementId === "string" ? bodyRecord.announcementId : "";
    const locale = parseLocale(bodyRecord.locale);

    if (!announcementId) {
      return NextResponse.json({ error: "Missing required field: announcementId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: announcement, error: announcementError } = await adminClient
      .from("announcements")
      .select("id,group_id")
      .eq("id", announcementId)
      .maybeSingle();

    if (announcementError) {
      return NextResponse.json({ error: announcementError.message }, { status: 500 });
    }

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    const groupId = (announcement as Record<string, unknown>).group_id as string | null;
    if (!groupId) {
      return NextResponse.json({ error: "Announcement group not found" }, { status: 404 });
    }

    const { data: adminMembership } = await adminClient
      .from("memberships")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .eq("membership_status", "active")
      .limit(1)
      .maybeSingle();

    if (!adminMembership && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: recipients, error: recErr } = await adminClient
      .from("memberships")
      .select("id")
      .eq("group_id", groupId)
      .eq("membership_status", "active")
      .not("user_id", "is", null)
      .neq("standing", "banned");

    if (recErr) {
      return NextResponse.json({ error: recErr.message }, { status: 500 });
    }

    const results: Cut2ProducerEnqueueSummary[] = [];
    for (const m of recipients || []) {
      results.push(
        await enqueueCut2ProducerChannels(
          {
            notificationType: "announcement",
            domainObjectId: announcementId,
            recipientMembershipId: m.id as string,
            locale,
          },
          adminClient,
        ),
      );
    }

    return NextResponse.json(summarize(results));
  } catch (err) {
    console.warn("[AnnouncementEnqueueRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
