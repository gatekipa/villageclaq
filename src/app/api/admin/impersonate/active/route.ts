/**
 * GET /api/admin/impersonate/active
 *
 * Returns the caller's active impersonation session (ended_at IS NULL),
 * enriched with the target user's display name so the banner has a
 * name to show. RLS on platform_impersonation_sessions already limits
 * rows to the caller's own rows (support) or all rows (super_admin);
 * we further constrain to impersonator = caller.
 */

import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const auth = await createAuthClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const { data: session, error } = await auth
      .from("platform_impersonation_sessions")
      .select("id, impersonated_user_id, started_at, reason, support_ticket_id")
      .eq("impersonator_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[impersonate/active] query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ active: null });
    }

    // Look up display name of the impersonated user for the banner.
    const { data: profile } = await auth
      .from("profiles")
      .select("full_name, display_name")
      .eq("id", session.impersonated_user_id)
      .maybeSingle();

    return NextResponse.json({
      active: {
        id: session.id,
        impersonatedUserId: session.impersonated_user_id,
        impersonatedName:
          (profile?.display_name as string | null) ||
          (profile?.full_name as string | null) ||
          null,
        startedAt: session.started_at,
        reason: session.reason,
        supportTicketId: session.support_ticket_id,
      },
    });
  } catch (err) {
    console.error("[impersonate/active]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
