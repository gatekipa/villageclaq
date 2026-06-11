import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { produceReliefEnrollmentNotifications } from "@/lib/relief-enrollment-producer";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_BATCH = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      console.warn("[ReliefEnrollmentProducerRoute] Malformed JSON:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const rawIds = Array.isArray(bodyRecord.enrollmentIds) ? bodyRecord.enrollmentIds : [];
    const enrollmentIds = rawIds.filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id));
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (enrollmentIds.length === 0) {
      return NextResponse.json({ error: "Missing required field: enrollmentIds" }, { status: 400 });
    }

    if (enrollmentIds.length > MAX_BATCH) {
      return NextResponse.json({ error: `Too many enrollmentIds (max ${MAX_BATCH})` }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve each enrollment's group via its plan; the caller must be an
    // active group owner/admin in EVERY targeted group (enrollment is an
    // admin action), or platform staff.
    const { data: enrollments, error: enrollmentsError } = await adminClient
      .from("relief_enrollments")
      .select("id,plan_id")
      .in("id", enrollmentIds);

    if (enrollmentsError) {
      return NextResponse.json({ error: enrollmentsError.message }, { status: 500 });
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ error: "Enrollments not found" }, { status: 404 });
    }

    const planIds = [...new Set(enrollments.map((e) => e.plan_id as string))];
    const { data: plans, error: plansError } = await adminClient
      .from("relief_plans")
      .select("id,group_id")
      .in("id", planIds);

    if (plansError || !plans) {
      return NextResponse.json({ error: plansError?.message || "Plans not found" }, { status: 500 });
    }

    const groupIds = [...new Set(plans.map((p) => p.group_id as string))];
    const staff = await isPlatformStaff(adminClient, user.id);

    if (!staff) {
      const { data: adminMemberships } = await adminClient
        .from("memberships")
        .select("group_id")
        .in("group_id", groupIds)
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .eq("membership_status", "active");

      const authorizedGroups = new Set((adminMemberships || []).map((m) => m.group_id as string));
      if (!groupIds.every((gid) => authorizedGroups.has(gid))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Process only the FOUND (and therefore authorization-checked) rows —
    // never the raw submitted list. This also dedupes repeated ids.
    const authorizedIds = [...new Set(enrollments.map((e) => e.id as string))];
    const results = [];
    for (const enrollmentId of authorizedIds) {
      results.push(await produceReliefEnrollmentNotifications(adminClient, enrollmentId, { locale }));
    }

    const hasError = results.some((r) => r.status === "error");
    return NextResponse.json({ results }, { status: hasError ? 500 : 200 });
  } catch (err) {
    console.warn("[ReliefEnrollmentProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
