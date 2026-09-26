import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";

/** R-011: the platform report receives aggregates, never claim rows. */
export async function POST(req: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });

  const { data: staff } = await authClient.from("platform_staff")
    .select("role").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (staff?.role !== "admin" && staff?.role !== "super_admin") {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  let range: string;
  try {
    const body = await req.json();
    range = body?.range;
    if (!["1m", "3m", "6m", "1y", "all"].includes(range))
      throw new Error("INVALID_RANGE");
  } catch {
    return NextResponse.json({ error: "INVALID_RANGE" }, { status: 400 });
  }

  const { data, error } = await authClient.rpc("platform_relief_aggregate_for_staff",
    { p_range: range });
  if (error) return NextResponse.json({ error: "AGGREGATE_UNAVAILABLE" }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}
