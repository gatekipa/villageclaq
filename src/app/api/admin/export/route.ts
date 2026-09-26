import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { canExport, type PlatformRole } from "@/lib/admin-rbac";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type ExportType = "members" | "attendance" | "contributions" | "relief";

/**
 * Admin export API route — generates CSV using the service role key.
 * Requires the caller to be a platform staff member (verified via session).
 *
 * POST /api/admin/export
 * Body: { type: ExportType }
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
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffRow) {
      return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
    }

    // 2. Parse the request
    const body = await req.json();
    const { type } = body as { type: ExportType };

    const allowedTypes: ExportType[] = ["members", "attendance", "contributions", "relief"];
    if (!type || !allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "type must be one of: members, attendance, contributions, relief" },
        { status: 400 }
      );
    }

    // Role-based export allowlist. platform_staff is_active alone is
    // insufficient — Support must not export contributions, Sales must
    // not export the member roster (PII), Finance only gets contributions.
    const callerRole = (staffRow as { role: PlatformRole }).role;
    if (!canExport(callerRole, type)) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: `role ${callerRole} cannot export ${type}`,
        },
        { status: 403 }
      );
    }

    // 3. Fetch data with service role client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    let csvContent = "";
    let filename = `${type}_export_${new Date().toISOString().split("T")[0]}.csv`;

    if (type === "members") {
      const { data, error } = await adminClient
        .from("profiles")
        .select("full_name, phone, created_at")
        .order("full_name");

      if (error) throw new Error(error.message);

      csvContent = "Full Name,Phone,Signup Date\n";
      if (data && data.length > 0) {
        csvContent += data
          .map(
            (row) =>
              `"${(row.full_name ?? "").replace(/"/g, '""')}","${row.phone ?? ""}","${row.created_at ?? ""}"`
          )
          .join("\n");
      }
    } else if (type === "attendance") {
      const { data, error } = await adminClient
        .from("event_attendances")
        .select("status, created_at, events(title, starts_at), memberships(display_name, profiles(full_name))")
        .order("created_at", { ascending: false })
        .limit(10000);

      if (error) throw new Error(error.message);

      csvContent = "Event Title,Event Date,Member,Status,Recorded At\n";
      if (data && data.length > 0) {
        csvContent += data
          .map((row) => {
            const event = row.events as unknown as { title: string; starts_at: string } | null;
            const membership = row.memberships as unknown as {
              display_name: string | null;
              profiles: { full_name: string | null } | null;
            } | null;
            const memberName =
              membership?.profiles?.full_name ?? membership?.display_name ?? "";
            return `"${(event?.title ?? "").replace(/"/g, '""')}","${event?.starts_at ?? ""}","${memberName.replace(/"/g, '""')}","${row.status ?? ""}","${row.created_at ?? ""}"`;
          })
          .join("\n");
      }
    } else if (type === "contributions") {
      const { data, error } = await adminClient
        .from("payments")
        .select("amount, currency, payment_method, recorded_at, memberships(display_name, profiles(full_name))")
        .order("recorded_at", { ascending: false })
        .limit(10000);

      if (error) throw new Error(error.message);

      csvContent = "Member,Amount,Currency,Payment Method,Recorded At\n";
      if (data && data.length > 0) {
        csvContent += data
          .map((row) => {
            const membership = row.memberships as unknown as {
              display_name: string | null;
              profiles: { full_name: string | null } | null;
            } | null;
            const memberName =
              membership?.profiles?.full_name ?? membership?.display_name ?? "";
            return `"${memberName.replace(/"/g, '""')}","${row.amount ?? ""}","${row.currency ?? ""}","${row.payment_method ?? ""}","${row.recorded_at ?? ""}"`;
          })
          .join("\n");
      }
    } else if (type === "relief") {
      // R-011: platform export is plan-level aggregate, never claim-level rows.
      const { data, error } = await authClient.rpc("platform_relief_aggregate_for_staff", {
        p_range: "all",
      });

      if (error) throw new Error(error.message);

      csvContent = "Group,Relief Plan,Currency,Claims,Claim Amount,Disbursed\n";
      if (data && data.length > 0) {
        csvContent += data
          .map((row: { group_name: string | null; plan_name: string | null;
            currency: string | null; claims_all: number | null;
            claim_amount_since: number | null; payouts_all: number | null }) => {
            const group = (row.group_name ?? "").replace(/"/g, '""');
            const plan = (row.plan_name ?? "").replace(/"/g, '""');
            return `"${group}","${plan}","${row.currency ?? ""}","${row.claims_all ?? 0}","${row.claim_amount_since ?? 0}","${row.payouts_all ?? 0}"`;
          })
          .join("\n");
      }
    }

    // 4. Audit log
    const auditClient = type === "relief" ? authClient : adminClient;
    const { error: auditError } = await auditClient.from("platform_audit_logs").insert({
      staff_id: staffRow.id,
      action: `export_${type}`,
      target_type: "data_export",
      details: {
        type,
        target_description: `Exported ${type} data as CSV`,
      },
    });
    if (auditError) throw new Error("EXPORT_AUDIT_FAILED");

    // 5. Return CSV
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[ADMIN EXPORT]", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: (err as Error).message },
      { status: 500 }
    );
  }
}
