import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Admin mutation API route — executes writes using the service role key.
 * Requires the caller to be a platform staff member (verified via session).
 *
 * POST /api/admin/mutate
 * Body: { action: string; table: string; data: Record<string, unknown>; match?: Record<string, unknown>; type: "insert" | "update" | "upsert" | "delete" }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify the caller is authenticated platform staff
    const authClient = await createAuthClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const { data: staffRow } = await authClient
      .from("platform_staff")
      .select("id, role, is_super_admin")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffRow) {
      return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
    }

    // 2. Parse the request
    const body = await req.json();
    const { action, table, data, match, type } = body as {
      action?: string;
      table: string;
      data?: Record<string, unknown>;
      match?: Record<string, unknown>;
      type: "insert" | "update" | "upsert" | "delete";
    };

    if (!table || !type) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "table and type required" },
        { status: 400 }
      );
    }

    // Allowlist of tables that admin can mutate
    const allowedTables = [
      "platform_staff",
      "platform_audit_logs",
      "platform_config",
      "platform_permissions",
      "subscription_plans",
      "subscription_vouchers",
      "contact_enquiries",
      "testimonials",
      "faqs",
      "group_subscriptions",
    ];

    if (!allowedTables.includes(table)) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: `Table ${table} is not allowed` },
        { status: 403 }
      );
    }

    // V10: mutating the platform_staff roster (granting / revoking staff
    // access, escalating someone to super_admin) is gated at super_admin
    // only. The DB policy "Super admin can manage staff" enforces the
    // same rule but wouldn't apply here because this route uses the
    // service-role client, which bypasses RLS.
    const isSuperAdmin = (staffRow as Record<string, unknown> | null)?.is_super_admin === true;
    if (table === "platform_staff" && !isSuperAdmin) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only super admins can modify platform_staff" },
        { status: 403 }
      );
    }

    // 3. Execute mutation using service role client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    let result: { data: unknown; error: { message: string } | null } = {
      data: null,
      error: null,
    };

    switch (type) {
      case "insert": {
        result = await adminClient.from(table).insert(data!).select();
        break;
      }
      case "update": {
        let query = adminClient.from(table).update(data!);
        if (match) {
          for (const [col, val] of Object.entries(match)) {
            query = query.eq(col, val as string);
          }
        }
        result = await query.select();
        break;
      }
      case "upsert": {
        result = await adminClient.from(table).upsert(data!).select();
        break;
      }
      case "delete": {
        let delQuery = adminClient.from(table).delete();
        if (match) {
          for (const [col, val] of Object.entries(match)) {
            delQuery = delQuery.eq(col, val as string);
          }
        }
        result = await delQuery.select();
        break;
      }
    }

    // 4. Optionally log the action to audit log
    if (action && table !== "platform_audit_logs") {
      await adminClient.from("platform_audit_logs").insert({
        staff_id: staffRow.id,
        action,
        target_type: table,
        details: {
          type,
          target_description: action,
          ...(match || {}),
        },
      });
    }

    if (result.error) {
      console.warn("[ADMIN MUTATE] DB error:", result.error.message);
      return NextResponse.json({ error: "MUTATION_FAILED" }, { status: 400 });
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[ADMIN MUTATE]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
