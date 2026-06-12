import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { whatsappRateLimit } from "@/lib/api-rate-limit";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { produceMemberInvitationNotification } from "@/lib/member-invitation-producer";

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

    // This is the only producer route whose recipients are NON-members
    // (arbitrary external phone numbers), so it carries the same per-user
    // rate limit as the direct send route. The day-bucket index bounds
    // per-invitation volume; this bounds per-caller volume.
    const rate = whatsappRateLimit(user.id);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (err) {
      console.warn("[InvitationProducerRoute] Malformed JSON:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const invitationId = typeof bodyRecord.invitationId === "string" ? bodyRecord.invitationId : "";
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (!invitationId) {
      return NextResponse.json({ error: "Missing required field: invitationId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: invitation, error: invitationError } = await adminClient
      .from("invitations")
      .select("id,group_id,invited_by")
      .eq("id", invitationId)
      .maybeSingle();

    if (invitationError) {
      console.warn("[InvitationProducerRoute] invitation lookup failed:", invitationError.message);
      return NextResponse.json({ error: "Invitation lookup failed" }, { status: 500 });
    }

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Allowed callers: the inviter, an active group owner/admin of the
    // invitation's group, or platform staff. This producer messages
    // arbitrary external phone numbers, so the authz must stay tight —
    // the invitee phone, link, and group name are all read from the
    // invitation row server-side, never from the request body.
    const invitationRecord = invitation as Record<string, unknown>;
    const groupId = invitationRecord.group_id as string | null;
    let authorized = (invitationRecord.invited_by as string | null) === user.id;

    if (!authorized && groupId) {
      const { data: adminMembership, error: adminLookupError } = await adminClient
        .from("memberships")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .eq("membership_status", "active")
        .limit(1)
        .maybeSingle();
      if (adminLookupError) {
        console.warn("[InvitationProducerRoute] authz admin lookup failed:", adminLookupError.message);
        return NextResponse.json({ error: "Authorization lookup failed" }, { status: 500 });
      }
      authorized = !!adminMembership;
    }

    if (!authorized && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await produceMemberInvitationNotification(adminClient, invitationId, { locale });
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  } catch (err) {
    console.warn("[InvitationProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
