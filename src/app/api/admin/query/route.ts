import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

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

    // Check if user is platform staff
    const { data: staffRow } = await authClient
      .from("platform_staff")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffRow) {
      return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
    }

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

    // 3. Execute all queries using service role client (bypasses ALL RLS)
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

          // Apply limit
          if (q.limit) {
            query = query.limit(q.limit);
          }

          const { data, error, count } = await query;
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
