import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformStaff } from "@/lib/api-recipient-guard";
import { producePaymentReceiptNotifications } from "@/lib/payment-receipt-producer";

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
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const paymentId = typeof bodyRecord.paymentId === "string" ? bodyRecord.paymentId : "";
    const locale = typeof bodyRecord.locale === "string" ? bodyRecord.locale : undefined;

    if (!paymentId) {
      return NextResponse.json({ error: "Missing required field: paymentId" }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: payment, error: paymentError } = await adminClient
      .from("payments")
      .select("id,recorded_by,group_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError) {
      return NextResponse.json({ error: paymentError.message }, { status: 500 });
    }

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Allowed callers: the recorder (member-submitted pay-now payments have
    // recorded_by = the paying member; admin-recorded payments have the
    // recording admin), a group owner/admin of the payment's group (the
    // confirming admin in the pay-now flow), or platform staff.
    const recordedBy = (payment as Record<string, unknown>).recorded_by as string | null;
    const paymentGroupId = (payment as Record<string, unknown>).group_id as string | null;
    let authorized = recordedBy === user.id;

    if (!authorized && paymentGroupId) {
      const { data: adminMembership } = await adminClient
        .from("memberships")
        .select("id")
        .eq("group_id", paymentGroupId)
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

    const result = await producePaymentReceiptNotifications(adminClient, paymentId, { locale });
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  } catch (err) {
    console.warn("[PaymentReceiptProducerRoute] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
