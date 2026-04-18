/**
 * POST /api/admin/users/suspend
 * Body: { userId: string; reason: string }
 *
 * Suspends a platform user: super_admin or admin role required. The
 * suspend_platform_user RPC flips every membership to 'suspended',
 * writes a platform_audit_logs row, and enforces the caller guard.
 * After a successful DB change, we also terminate the user's
 * Supabase sessions so existing JWTs stop refreshing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { terminateUserSessions } from "@/lib/admin-signout";

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const body = await req.json();
    const { userId, reason } = body as { userId?: string; reason?: string };
    if (!userId || !reason) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "userId and reason required" },
        { status: 400 },
      );
    }

    const { data, error } = await auth.rpc("suspend_platform_user", {
      p_user_id: userId,
      p_reason: reason,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const env = (data || {}) as { ok?: boolean; error?: string };
    if (!env.ok) {
      return NextResponse.json({ error: env.error || "FAILED" }, { status: 403 });
    }

    // Best-effort — the DB change is the source of truth, session
    // termination is belt-and-braces to cut off JWT refresh.
    await terminateUserSessions(userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users/suspend]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
