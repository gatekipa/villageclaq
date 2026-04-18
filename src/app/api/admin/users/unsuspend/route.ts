/**
 * POST /api/admin/users/unsuspend
 * Body: { userId: string }
 *
 * Restores suspended memberships back to 'active'. Super/Admin only
 * per the RPC. Does not sign the user back in — they'll re-auth the
 * next time they try to access the app.
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

    const body = await req.json();
    const { userId } = body as { userId?: string };
    if (!userId) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "userId required" },
        { status: 400 },
      );
    }

    const { data, error } = await auth.rpc("unsuspend_platform_user", {
      p_user_id: userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const env = (data || {}) as { ok?: boolean; error?: string };
    if (!env.ok) {
      return NextResponse.json({ error: env.error || "FAILED" }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users/unsuspend]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
