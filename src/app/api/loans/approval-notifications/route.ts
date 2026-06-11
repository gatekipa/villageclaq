import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { produceLoanApprovedNotification } from "@/lib/loan-approved-producer";

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
      console.warn("[LoanProducerRoute] Malformed JSON:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const loanId = typeof bodyRecord.loanId === "string" ? bodyRecord.loanId : "";
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (!loanId) {
      return NextResponse.json({ error: "Missing required field: loanId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: loan, error: loanError } = await adminClient
      .from("loans")
      .select("id,group_id,membership_id")
      .eq("id", loanId)
      .maybeSingle();

    if (loanError) {
      console.warn("[LoanProducerRoute] loan lookup failed:", loanError.message);
      return NextResponse.json({ error: "Loan lookup failed" }, { status: 500 });
    }

    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    // Allowed callers: the borrower, an active group owner/admin of the
    // loan's group, or platform staff. Approval state and amount are read
    // authoritatively from the DB inside the producer.
    const loanRecord = loan as Record<string, unknown>;
    const groupId = loanRecord.group_id as string | null;
    const { data: borrowerMembership } = await adminClient
      .from("memberships")
      .select("user_id")
      .eq("id", loanRecord.membership_id as string)
      .maybeSingle();
    const memberUserId = (borrowerMembership?.user_id as string | null) ?? null;
    let authorized = memberUserId !== null && memberUserId === user.id;

    if (!authorized && groupId) {
      const { data: adminMembership } = await adminClient
        .from("memberships")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .eq("membership_status", "active")
        .limit(1)
        .maybeSingle();
      authorized = !!adminMembership;
    }

    if (!authorized && !(await isPlatformStaff(adminClient, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await produceLoanApprovedNotification(adminClient, loanId, { locale });
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  } catch (err) {
    console.warn("[LoanProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
