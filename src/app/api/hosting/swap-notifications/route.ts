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
    const swapRequestId = typeof bodyRecord.swapRequestId === "string" ? bodyRecord.swapRequestId : "";
    const locale = parseLocale(bodyRecord.locale);

    if (!swapRequestId) {
      return NextResponse.json({ error: "Missing required field: swapRequestId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: swap, error: swapError } = await adminClient
      .from("hosting_swap_requests")
      .select("id,status,requested_by,from_assignment_id")
      .eq("id", swapRequestId)
      .maybeSingle();

    if (swapError) {
      return NextResponse.json({ error: swapError.message }, { status: 500 });
    }

    if (!swap) {
      return NextResponse.json({ error: "Swap request not found" }, { status: 404 });
    }

    const fromAssignmentId = (swap as Record<string, unknown>).from_assignment_id as string | null;
    if (!fromAssignmentId) {
      return NextResponse.json({ error: "Swap assignment not found" }, { status: 404 });
    }

    const { data: assignment, error: assignmentError } = await adminClient
      .from("hosting_assignments")
      .select("id,roster_id")
      .eq("id", fromAssignmentId)
      .maybeSingle();

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const rosterId = (assignment as Record<string, unknown>).roster_id as string | null;
    if (!rosterId) {
      return NextResponse.json({ error: "Roster not found" }, { status: 404 });
    }

    const { data: roster, error: rosterError } = await adminClient
      .from("hosting_rosters")
      .select("id,group_id")
      .eq("id", rosterId)
      .maybeSingle();

    if (rosterError) {
      return NextResponse.json({ error: rosterError.message }, { status: 500 });
    }

    if (!roster) {
      return NextResponse.json({ error: "Roster not found" }, { status: 404 });
    }

    const groupId = (roster as Record<string, unknown>).group_id as string | null;
    if (!groupId) {
      return NextResponse.json({ error: "Swap group not found" }, { status: 404 });
    }

    const { data: callerMembership } = await adminClient
      .from("memberships")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .eq("membership_status", "active")
      .limit(1)
      .maybeSingle();

    if (!callerMembership && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = (swap as Record<string, unknown>).status as string;
    let recipientQuery = adminClient.from("memberships").select("id").eq("group_id", groupId);

    if (status === "pending") {
      recipientQuery = recipientQuery
        .in("role", ["owner", "admin"])
        .eq("membership_status", "active")
        .not("user_id", "is", null);
    } else if (status === "approved" || status === "rejected") {
      const requestedBy = (swap as Record<string, unknown>).requested_by as string | null;
      if (!requestedBy) {
        return NextResponse.json(summarize([]));
      }
      recipientQuery = recipientQuery.eq("user_id", requestedBy);
    } else {
      return NextResponse.json(summarize([]));
    }

    const { data: recipients, error: recErr } = await recipientQuery;
    if (recErr) {
      return NextResponse.json({ error: recErr.message }, { status: 500 });
    }

    const results: Cut2ProducerEnqueueSummary[] = [];
    for (const m of recipients || []) {
      results.push(
        await enqueueCut2ProducerChannels(
          {
            notificationType: "hosting_swap",
            domainObjectId: swapRequestId,
            recipientMembershipId: m.id as string,
            locale,
          },
          adminClient,
        ),
      );
    }

    return NextResponse.json(summarize(results));
  } catch (err) {
    console.warn("[HostingSwapRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
