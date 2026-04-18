/**
 * POST /api/admin/users/archive
 * Body: { userId: string; reason: string }
 *
 * Soft-delete / anonymise a platform user. Super_admin only. The RPC
 * blocks archival if the user still owns an active group (to prevent
 * orphaning). Financial records are preserved; the profile is
 * anonymised ([deleted]) and memberships flip to 'archived'.
 * Sessions are terminated so the archived user cannot re-enter.
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

    const { data, error } = await auth.rpc("archive_platform_user", {
      p_user_id: userId,
      p_reason: reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const env = (data || {}) as {
      ok?: boolean;
      error?: string;
      owned_groups?: number;
    };
    if (!env.ok) {
      return NextResponse.json(
        { error: env.error || "FAILED", ownedGroups: env.owned_groups },
        { status: 403 },
      );
    }

    await terminateUserSessions(userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users/archive]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
