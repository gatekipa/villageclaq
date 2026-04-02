import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/relief-sync
 * Vercel Cron — runs daily at 02:00 UTC.
 *
 * Calls two Supabase RPC functions:
 * 1. sync_relief_eligibility_statuses() — transitions waiting_period → eligible
 * 2. sync_relief_contribution_statuses() — marks members with no current-period payment as behind
 *
 * Both functions are SECURITY DEFINER and bypass RLS.
 */
export async function GET(request: Request) {
  // ── Auth: verify CRON_SECRET ──
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Transition waiting_period → eligible for overdue enrollments
    const { data: eligibilityCount, error: eligErr } = await supabase.rpc(
      "sync_relief_eligibility_statuses"
    );
    if (eligErr) {
      return NextResponse.json(
        { error: `sync_relief_eligibility_statuses failed: ${eligErr.message}` },
        { status: 500 }
      );
    }

    // 2. Sync contribution statuses from payment records
    const { data: contribCount, error: contribErr } = await supabase.rpc(
      "sync_relief_contribution_statuses"
    );
    if (contribErr) {
      return NextResponse.json(
        { error: `sync_relief_contribution_statuses failed: ${contribErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eligibility_transitions: eligibilityCount ?? 0,
      contribution_updates: contribCount ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
