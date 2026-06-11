import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { produceReliefClaimDecisionNotification } from "@/lib/relief-claim-decision-producer";

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
      console.warn("[ClaimProducerRoute] Malformed JSON:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const claimId = typeof bodyRecord.claimId === "string" ? bodyRecord.claimId : "";
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (!claimId) {
      return NextResponse.json({ error: "Missing required field: claimId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    // relief_claims has no group_id — the group is the plan's group.
    const { data: claim, error: claimError } = await adminClient
      .from("relief_claims")
      .select("id,plan_id,membership_id")
      .eq("id", claimId)
      .maybeSingle();

    if (claimError) {
      console.warn("[ClaimProducerRoute] claim lookup failed:", claimError.message);
      return NextResponse.json({ error: "Claim lookup failed" }, { status: 500 });
    }

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const claimRecord = claim as Record<string, unknown>;
    const [planResult, claimantResult] = await Promise.all([
      adminClient
        .from("relief_plans")
        .select("group_id")
        .eq("id", claimRecord.plan_id as string)
        .maybeSingle(),
      adminClient
        .from("memberships")
        .select("user_id")
        .eq("id", claimRecord.membership_id as string)
        .maybeSingle(),
    ]);

    if (planResult.error || claimantResult.error) {
      console.warn(
        "[ClaimProducerRoute] authz lookup failed:",
        planResult.error?.message || claimantResult.error?.message,
      );
      return NextResponse.json({ error: "Authorization lookup failed" }, { status: 500 });
    }

    // Allowed callers: the claimant, an active owner/admin of the plan's
    // group, or platform staff. The decision/amount/reason are read
    // authoritatively from the DB inside the producer.
    const groupId = (planResult.data?.group_id as string | null) ?? null;
    const memberUserId = (claimantResult.data?.user_id as string | null) ?? null;
    let authorized = memberUserId !== null && memberUserId === user.id;

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
        console.warn("[ClaimProducerRoute] authz admin lookup failed:", adminLookupError.message);
        return NextResponse.json({ error: "Authorization lookup failed" }, { status: 500 });
      }
      authorized = !!adminMembership;
    }

    if (!authorized && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await produceReliefClaimDecisionNotification(adminClient, claimId, { locale });
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  } catch (err) {
    console.warn("[ClaimProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
