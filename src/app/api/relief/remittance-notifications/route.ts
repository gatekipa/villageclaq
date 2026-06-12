import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { produceRemittanceDecisionNotifications } from "@/lib/remittance-decision-producer";

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
      console.warn("[RemittanceProducerRoute] Malformed JSON:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const remittanceId = typeof bodyRecord.remittanceId === "string" ? bodyRecord.remittanceId : "";
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (!remittanceId) {
      return NextResponse.json({ error: "Missing required field: remittanceId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: remittance, error: remittanceError } = await adminClient
      .from("relief_remittances")
      .select("id,branch_group_id")
      .eq("id", remittanceId)
      .maybeSingle();

    if (remittanceError) {
      console.warn("[RemittanceProducerRoute] remittance lookup failed:", remittanceError.message);
      return NextResponse.json({ error: "Remittance lookup failed" }, { status: 500 });
    }

    if (!remittance) {
      return NextResponse.json({ error: "Remittance not found" }, { status: 404 });
    }

    // Allowed callers: an active owner/admin of the BRANCH group (the
    // submitting side), an active owner/admin of an HQ group in the same
    // organization (the deciding side — mirrors the relief_remittances
    // UPDATE RLS), or platform staff. The decision/amount/recipients are
    // all read authoritatively from the DB inside the producer.
    const branchGroupId = (remittance as Record<string, unknown>).branch_group_id as string;
    const { data: branchGroup, error: branchLookupError } = await adminClient
      .from("groups")
      .select("id,organization_id")
      .eq("id", branchGroupId)
      .maybeSingle();

    if (branchLookupError) {
      console.warn("[RemittanceProducerRoute] authz group lookup failed:", branchLookupError.message);
      return NextResponse.json({ error: "Authorization lookup failed" }, { status: 500 });
    }

    const { data: branchAdmin, error: branchAdminError } = await adminClient
      .from("memberships")
      .select("id")
      .eq("group_id", branchGroupId)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .eq("membership_status", "active")
      .limit(1)
      .maybeSingle();

    if (branchAdminError) {
      console.warn("[RemittanceProducerRoute] authz branch lookup failed:", branchAdminError.message);
      return NextResponse.json({ error: "Authorization lookup failed" }, { status: 500 });
    }

    let authorized = !!branchAdmin;

    const organizationId = (branchGroup as Record<string, unknown> | null)?.organization_id as string | null;
    if (!authorized && organizationId) {
      const { data: hqAdmin, error: hqLookupError } = await adminClient
        .from("memberships")
        .select("id, groups!inner(id, organization_id, group_level)")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .eq("membership_status", "active")
        .eq("groups.organization_id", organizationId)
        .eq("groups.group_level", "hq")
        .limit(1)
        .maybeSingle();
      if (hqLookupError) {
        console.warn("[RemittanceProducerRoute] authz HQ lookup failed:", hqLookupError.message);
        return NextResponse.json({ error: "Authorization lookup failed" }, { status: 500 });
      }
      authorized = !!hqAdmin;
    }

    if (!authorized && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await produceRemittanceDecisionNotifications(adminClient, remittanceId, { locale });
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  } catch (err) {
    console.warn("[RemittanceProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
