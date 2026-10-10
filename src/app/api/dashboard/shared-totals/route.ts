import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { computeDuesStatusTotals, computeMoneyFigures, type MoneyObligation, type MoneyPayment } from "@/lib/money";
import { groupTodayKey } from "@/lib/payment-reminder-eligibility";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Only group aggregates leave this route; individual obligations and receipts stay private. */
export async function GET(request: Request) {
  const groupId = new URL(request.url).searchParams.get("groupId");
  if (!groupId || !uuidPattern.test(groupId)) return response({ error: "Invalid group" }, 400);
  const userClient = await createUserClient();
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return response({ error: "Unauthorized" }, 401);

  const { data: membership, error: memberError } = await userClient
    .from("memberships").select("id")
    .eq("group_id", groupId).eq("user_id", user.id)
    .eq("membership_status", "active").maybeSingle();
  if (memberError || !membership) return response({ error: "Forbidden" }, 403);

  const { data: group, error: groupError } = await userClient.from("groups")
    .select("sharing_controls, settings").eq("id", groupId).single();
  if (groupError || !group) return response({ error: "Forbidden" }, 403);

  const [financeView, financeManage, memberManage] = await Promise.all([
    userClient.rpc("has_group_permission", { gid: groupId, perm_key: "finances.view" }),
    userClient.rpc("has_group_permission", { gid: groupId, perm_key: "finances.manage" }),
    userClient.rpc("has_group_permission", { gid: groupId, perm_key: "members.manage" }),
  ]);
  if (financeView.error || financeManage.error || memberManage.error) {
    return response({ error: "Authorization unavailable" }, 503);
  }
  const sharing = group.sharing_controls as Record<string, boolean> | null;
  const maySeeFinance = Boolean(financeView.data || financeManage.data || sharing?.financial_summary);
  const maySeeCount = Boolean(memberManage.data || sharing?.member_count);
  if (!maySeeFinance && !maySeeCount) return response({ memberCount: null, financial: null });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return response({ error: "Observation unavailable" }, 503);
  const service = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let memberCount: number | null = null;
  if (maySeeCount) {
    const count = await service.from("memberships").select("id", { count: "exact", head: true })
      .eq("group_id", groupId).neq("membership_status", "pending_approval");
    if (count.error) return response({ error: "Observation unavailable" }, 503);
    memberCount = count.count ?? 0;
  }
  if (!maySeeFinance) return response({ memberCount, financial: null });

  const [obligations, payments] = await Promise.all([
    fetchAllRows((from, to) => service.from("contribution_obligations")
      .select("id,amount,status,due_date,membership_id,contribution_type_id,contribution_type:contribution_types!inner(id),membership:memberships!inner(id)", { count: "exact" })
      .eq("group_id", groupId).order("id").range(from, to)),
    fetchAllRows((from, to) => service.from("payments")
      .select("id,amount,status,settlement_status,obligation_id,contribution_type_id,membership_id,relief_plan_id,recorded_at", { count: "exact" })
      .eq("group_id", groupId).is("relief_plan_id", null).order("id").range(from, to)),
  ]);
  if (obligations.error || payments.error) return response({ error: "Observation unavailable" }, 503);
  const today = groupTodayKey(group.settings as Record<string, unknown> | null);
  const figures = computeMoneyFigures(obligations.data as MoneyObligation[], payments.data as MoneyPayment[], { today });
  const dues = computeDuesStatusTotals(obligations.data as MoneyObligation[], payments.data as MoneyPayment[], today);
  return response({
    memberCount,
    financial: {
      outstanding: dues.outstanding,
      overdue: dues.overdue.amount,
      collectionRate: figures.expected > 0 ? Math.round(figures.collected / figures.expected * 100) : 0,
      observedAt: new Date().toISOString(),
    },
  });
}
