import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { canRead, type PlatformRole } from "@/lib/admin-rbac";
import { validateSelect, isAllowedColumn } from "@/lib/admin-query-config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Admin query API route — executes Supabase queries using the service role key.
 * Requires the caller to be a platform staff member (verified via session).
 *
 * POST /api/admin/query
 * Body: { queries: Array<{ key: string; table: string; select: string; filters?: Array<{ column: string; op: string; value: any }>; order?: { column: string; ascending?: boolean }; limit?: number; count?: "exact" | "planned" }> }
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

    // Check if user is platform staff AND read the role — prior version
    // only checked is_active, letting any staff read any table via the
    // service-role client below (bypassing RLS).
    const { data: staffRow } = await authClient
      .from("platform_staff")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffRow) {
      return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
    }

    const callerRole = (staffRow as { role: PlatformRole }).role;

    // 2. Parse the request
    const body = await req.json();
    const { queries } = body as {
      queries: Array<{
        key: string;
        table: string;
        select: string;
        filters?: Array<{ column: string; op: string; value: unknown }>;
        order?: { column: string; ascending?: boolean };
        limit?: number;
        count?: "exact" | "planned";
      }>;
    };

    if (!queries || !Array.isArray(queries)) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "queries array required" },
        { status: 400 }
      );
    }

    // Role-based table allowlist. Because this route runs under the
    // service-role client (bypassing RLS), the allowlist is the only
    // wall between a Sales staff member and the payments table.
    const forbidden = queries.find((q) => !canRead(callerRole, q.table));
    if (forbidden) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: `role ${callerRole} cannot read ${forbidden.table}`,
        },
        { status: 403 }
      );
    }

    // 2b. SELECT / FILTER / ORDER lockdown. The service-role client below
    // bypasses ALL RLS, and PostgREST honours relational embeds inside the
    // `select` string ("*, memberships(*, payments(*))"), which would let a
    // caller read tables OUTSIDE their role allowlist through an embed. Reject
    // arbitrary embeds + wildcards (only the frozen known-good admin shapes
    // pass) and require identifier-only filter/order columns BEFORE any query
    // runs. Rebuild q.select from the validated/normalised value so the raw
    // client string is never forwarded. See src/lib/admin-query-config.ts.
    for (const q of queries) {
      const validated = validateSelect(q.table, q.select);
      if (!validated.ok) {
        return NextResponse.json(
          { error: validated.code, message: `${q.key}: ${validated.message}` },
          { status: 400 }
        );
      }
      q.select = validated.select;

      if (q.filters) {
        for (const f of q.filters) {
          if (!isAllowedColumn(f.column)) {
            return NextResponse.json(
              { error: "FILTER_COLUMN_NOT_ALLOWED", message: `${q.key}: illegal filter column "${f.column}"` },
              { status: 400 }
            );
          }
        }
      }
      if (q.order && !isAllowedColumn(q.order.column)) {
        return NextResponse.json(
          { error: "ORDER_COLUMN_NOT_ALLOWED", message: `${q.key}: illegal order column "${q.order.column}"` },
          { status: 400 }
        );
      }
    }

    // 3. Execute all queries using service role client (bypasses ALL RLS).
    //    q.select is now the validated/normalised value from step 2b.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const results: Record<string, { data: unknown; error: string | null; count?: number }> =
      {};

    await Promise.all(
      queries.map(async (q) => {
        try {
          let query = adminClient
            .from(q.table)
            .select(q.select, q.count ? { count: q.count } : undefined);

          // Apply filters
          if (q.filters) {
            for (const f of q.filters) {
              switch (f.op) {
                case "eq":
                  query = query.eq(f.column, f.value);
                  break;
                case "neq":
                  query = query.neq(f.column, f.value);
                  break;
                case "gt":
                  query = query.gt(f.column, f.value);
                  break;
                case "gte":
                  query = query.gte(f.column, f.value);
                  break;
                case "lt":
                  query = query.lt(f.column, f.value);
                  break;
                case "lte":
                  query = query.lte(f.column, f.value);
                  break;
                case "like":
                  query = query.like(f.column, f.value as string);
                  break;
                case "ilike":
                  query = query.ilike(f.column, f.value as string);
                  break;
                case "in":
                  query = query.in(f.column, f.value as unknown[]);
                  break;
                case "is":
                  query = query.is(f.column, f.value as null | boolean);
                  break;
                case "not.is":
                  query = query.not(f.column, "is", f.value as null | boolean);
                  break;
                default:
                  break;
              }
            }
          }

          // Apply ordering
          if (q.order) {
            query = query.order(q.order.column, {
              ascending: q.order.ascending ?? true,
            });
          }

          // Apply a hard SAFETY CEILING — never a low default. A spec with no
          // limit previously returned the ENTIRE table (the admin client
          // bypasses RLS), risking an unbounded cross-tenant payload. We cap at
          // a generous ceiling so callers that intentionally omit `limit` to
          // build a count/aggregate from the full result (e.g. admin/groups
          // per-group member counts, admin/revenue) are NOT silently truncated
          // at today's scale — only an extreme >10k-row result is bounded, and
          // those screens are slated to move to server-side aggregation (see
          // src/PERFORMANCE_NOTES.md). count:"exact" still returns the exact
          // total independently of the row cap.
          const ADMIN_MAX_LIMIT = 10000;
          const lim = Math.min(q.limit ?? ADMIN_MAX_LIMIT, ADMIN_MAX_LIMIT);
          query = query.limit(lim);

          const { data, error, count } = await query;
          if ((data?.length ?? 0) >= lim) {
            console.warn(`[ADMIN QUERY] '${q.key}' on ${q.table} hit the ${lim}-row ceiling — result may be truncated; move this to a server-side aggregate.`);
          }
          results[q.key] = {
            data: data ?? [],
            error: error?.message ?? null,
            count: count ?? undefined,
          };
        } catch (err) {
          results[q.key] = {
            data: [],
            error: (err as Error).message,
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[ADMIN QUERY]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
