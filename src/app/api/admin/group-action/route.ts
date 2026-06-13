import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { PlatformRole } from "@/lib/admin-rbac";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VALID_TIERS = ["free", "starter", "pro", "enterprise"];

/**
 * Platform-admin group control plane — narrowly-scoped lifecycle + plan writes.
 *
 * Deliberately a DEDICATED route rather than the generic /api/admin/mutate:
 * it only ever touches the specific group lifecycle columns or the
 * group_subscriptions.tier, so it cannot be used to rewrite arbitrary `groups`
 * columns. RBAC:
 *   - suspend / activate / archive  → super_admin, admin   (operational)
 *   - change_plan                   → super_admin, finance (billing)
 *
 * POST /api/admin/group-action
 * Body: { action: "suspend"|"activate"|"archive"|"change_plan",
 *         groupId: string, reason?: string, tier?: string }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the caller as active platform staff.
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const { data: staffRow } = await authClient
      .from("platform_staff")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffRow) {
      return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
    }
    const role = (staffRow as { role: PlatformRole }).role;

    // 2. Parse + validate.
    const body = await req.json();
    const { action, groupId, reason, tier } = body as {
      action?: string;
      groupId?: string;
      reason?: string;
      tier?: string;
    };

    if (!groupId || !action) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "action and groupId required" },
        { status: 400 },
      );
    }

    const isLifecycle = action === "suspend" || action === "activate" || action === "archive";
    const isPlan = action === "change_plan";
    if (!isLifecycle && !isPlan) {
      return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
    }

    // 3. RBAC — lifecycle vs billing have different operator roles.
    if (isLifecycle && !(role === "super_admin" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (isPlan && !(role === "super_admin" || role === "finance")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const trimmedReason = (reason || "").trim();
    // Destructive / account-impacting actions must capture a reason.
    if ((action === "suspend" || action === "archive") && !trimmedReason) {
      return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const nowIso = new Date().toISOString();
    let auditAction = "";
    const auditDetails: Record<string, unknown> = { action };

    if (isLifecycle) {
      let update: Record<string, unknown>;
      if (action === "suspend") {
        update = {
          status: "suspended",
          is_active: false,
          suspended_at: nowIso,
          suspension_reason: trimmedReason,
        };
        auditAction = "group.suspend";
        auditDetails.reason = trimmedReason;
      } else if (action === "activate") {
        update = {
          status: "active",
          is_active: true,
          suspended_at: null,
          suspension_reason: null,
          archived_at: null,
          archived_reason: null,
        };
        auditAction = "group.activate";
        if (trimmedReason) auditDetails.reason = trimmedReason;
      } else {
        update = {
          status: "archived",
          is_active: false,
          archived_at: nowIso,
          archived_reason: trimmedReason,
        };
        auditAction = "group.archive";
        auditDetails.reason = trimmedReason;
      }

      const { error } = await admin.from("groups").update(update).eq("id", groupId);
      if (error) {
        // Most likely the 00103 lifecycle columns are not deployed yet — the UI
        // disables these actions until the migration is applied, but fail loud.
        console.warn("[group-action] lifecycle update failed:", error.message);
        return NextResponse.json({ error: "LIFECYCLE_UNAVAILABLE" }, { status: 400 });
      }
    } else {
      // change_plan — write ONLY the tier. Deliberately does NOT write `status`:
      // on the conflict/update path that would clobber a real billing state
      // (past_due / cancelled / expired) back to 'active', silently resurrecting
      // a delinquent subscription as a side effect of a tier change. The column
      // defaults to 'active' for the insert (new-subscription) case, and existing
      // Stripe linkage columns are preserved on conflict.
      if (!tier || !VALID_TIERS.includes(tier)) {
        return NextResponse.json({ error: "INVALID_TIER" }, { status: 400 });
      }
      auditAction = "group.change_plan";
      auditDetails.tier = tier;
      if (trimmedReason) auditDetails.reason = trimmedReason;

      const { error } = await admin
        .from("group_subscriptions")
        .upsert({ group_id: groupId, tier }, { onConflict: "group_id" });
      if (error) {
        console.warn("[group-action] plan update failed:", error.message);
        return NextResponse.json({ error: "PLAN_UPDATE_FAILED" }, { status: 400 });
      }
    }

    // 4. Audit every action.
    await admin.from("platform_audit_logs").insert({
      staff_id: staffRow.id,
      action: auditAction,
      target_type: "groups",
      target_id: groupId,
      details: auditDetails,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[group-action]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
