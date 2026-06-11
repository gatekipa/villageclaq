import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { produceWelcomeNotifications } from "@/lib/welcome-producer";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    } catch (err) {
      console.warn("[WelcomeProducerRoute] Malformed JSON:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const membershipId = typeof bodyRecord.membershipId === "string" ? bodyRecord.membershipId : "";
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (!membershipId) {
      return NextResponse.json({ error: "Missing required field: membershipId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: membership, error: membershipError } = await adminClient
      .from("memberships")
      .select("id,user_id")
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    // The welcome recipient is the joining member; only that member (the
    // caller of every wired join flow) or platform staff may trigger it.
    const memberUserId = (membership as Record<string, unknown>).user_id as string | null;
    if (memberUserId !== user.id && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await produceWelcomeNotifications(adminClient, membershipId, { locale });
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  } catch (err) {
    console.warn("[WelcomeProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
