/**
 * GET /api/cron/expire-impersonation-sessions
 *
 * Vercel Cron — runs every 15 minutes. Closes any impersonation
 * session older than 2 hours via the expire_stale_impersonations
 * SECURITY DEFINER RPC, which also writes audit rows for each
 * closure (action='impersonation.timeout', ended_reason='timeout').
 *
 * Auth: Bearer CRON_SECRET — shared with the other cron routes.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.rpc("expire_stale_impersonations");
    if (error) {
      console.warn("[Cron:ExpireImpersonation] RPC error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const expired = typeof data === "number" ? data : 0;
    return NextResponse.json({ expired });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:ExpireImpersonation] fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
