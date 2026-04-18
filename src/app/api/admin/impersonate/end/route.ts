/**
 * POST /api/admin/impersonate/end
 * Body: { sessionId?: string }
 *
 * Ends an impersonation session. The RPC permits the impersonator to
 * end their own session; a super_admin can end anyone's session (e.g.
 * revoke a runaway support session). Audit-logs 'impersonation.end'.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = (body?.sessionId as string | undefined) || null;

    const { data, error } = await auth.rpc("end_impersonation", {
      p_session_id: sessionId,
    });
    if (error) {
      console.warn("[impersonate/end] RPC error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const env = (data || {}) as { ok?: boolean; error?: string };
    if (!env.ok) {
      return NextResponse.json({ error: env.error || "FAILED" }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[impersonate/end]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
