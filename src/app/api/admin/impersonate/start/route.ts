/**
 * POST /api/admin/impersonate/start
 * Body: { targetUserId: string; reason: string; ticketId?: string }
 *
 * Gated by the start_impersonation SECURITY DEFINER RPC which:
 *  - Verifies the caller is active platform_staff.
 *  - Enforces role ∈ {super_admin, support}.
 *  - For support: requires an open contact_enquiries ticket assigned
 *    to the caller (p_ticket_id).
 *  - Enforces max 1 active session per impersonator.
 *  - Inserts into platform_impersonation_sessions and writes a
 *    platform_audit_logs row with action = 'impersonation.start'.
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
    const { targetUserId, reason, ticketId } = body as {
      targetUserId?: string;
      reason?: string;
      ticketId?: string | null;
    };

    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "targetUserId required" },
        { status: 400 },
      );
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "reason required" },
        { status: 400 },
      );
    }

    const { data, error } = await auth.rpc("start_impersonation", {
      p_target_user_id: targetUserId,
      p_reason: reason,
      p_ticket_id: ticketId || null,
    });

    if (error) {
      console.warn("[impersonate/start] RPC error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const env = (data || {}) as { ok?: boolean; error?: string; session_id?: string };
    if (!env.ok) {
      return NextResponse.json({ error: env.error || "FAILED" }, { status: 403 });
    }

    return NextResponse.json({ sessionId: env.session_id });
  } catch (err) {
    console.error("[impersonate/start]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
