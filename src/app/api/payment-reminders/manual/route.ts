import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { computeConfirmedReminderDecision, type ObligationRow } from "@/lib/payment-reminder-producer";
import { evaluatePaymentReminderEligibility, paymentReminderSettingsFromGroup } from "@/lib/payment-reminder-eligibility";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  const locale = body?.locale === "fr" ? "fr" : "en";
  const obligationIds = Array.isArray(body?.obligationIds)
    ? Array.from(new Set(body.obligationIds.filter((id): id is string => typeof id === "string"))).slice(0, 100)
    : [];
  if (!groupId || obligationIds.length === 0) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const actor = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userResult } = await actor.auth.getUser(token);
  if (!userResult.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: allowed, error: permissionError } = await actor.rpc("has_group_permission", {
    gid: groupId,
    perm_key: "contributions.manage",
    uid: userResult.user.id,
  });
  if (permissionError || allowed !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: obligations, error: obligationsError }, { data: group, error: groupError }] = await Promise.all([
    service
      .from("contribution_obligations")
      .select("id,contribution_type_id,membership_id,group_id,amount,amount_paid,currency,due_date,status,membership:memberships!inner(id,group_id,user_id,is_proxy,membership_status)")
      .eq("group_id", groupId)
      .in("id", obligationIds),
    service.from("groups").select("id,settings").eq("id", groupId).maybeSingle(),
  ]);
  if (obligationsError || groupError || !group) return NextResponse.json({ error: "Reminder state unavailable" }, { status: 500 });

  const settings = paymentReminderSettingsFromGroup(group.settings as Record<string, unknown> | null);
  const byMember = new Map<string, { userId: string; total: number; currency: string; obligationIds: string[]; reminderDate: string }>();
  const skipped: Array<{ obligationId: string; reason: string }> = [];

  for (const raw of obligations || []) {
    const membershipRaw = raw.membership as Record<string, unknown> | Record<string, unknown>[] | null;
    const membership = (Array.isArray(membershipRaw) ? membershipRaw[0] : membershipRaw) || {};
    const decision = await computeConfirmedReminderDecision(service, raw as unknown as ObligationRow, console);
    if (decision === "error") {
      skipped.push({ obligationId: raw.id, reason: "confirmed_balance_lookup_failed" });
      continue;
    }
    const eligibility = evaluatePaymentReminderEligibility({
      dueDate: raw.due_date,
      contributionTypeId: raw.contribution_type_id,
      obligationStatus: raw.status,
      membershipStatus: membership.membership_status as string | null,
      userId: membership.user_id as string | null,
      isProxy: membership.is_proxy as boolean | null,
      confirmedRemaining: decision.remaining,
    }, settings);
    if (!decision.eligible || !eligibility.eligible) {
      skipped.push({ obligationId: raw.id, reason: decision.eligible ? eligibility.reason : (decision.suppressed || "obligation_settled_confirmed") });
      continue;
    }
    const membershipId = raw.membership_id as string;
    const current = byMember.get(membershipId) || {
      userId: membership.user_id as string,
      total: 0,
      currency: (raw.currency as string) || "XAF",
      obligationIds: [],
      reminderDate: eligibility.localDate,
    };
    current.total += decision.remaining;
    current.obligationIds.push(raw.id as string);
    byMember.set(membershipId, current);
  }

  let sent = 0;
  for (const [membershipId, reminder] of byMember) {
    const { data: existing } = await service
      .from("notifications")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", reminder.userId)
      .eq("type", "contribution_due")
      .eq("data->>source", "manual_payment_reminder")
      .eq("data->>membershipId", membershipId)
      .eq("data->>reminderDate", reminder.reminderDate)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const amount = formatAmount(reminder.total, reminder.currency);
    const title = locale === "fr" ? "Rappel de paiement" : "Payment reminder";
    const message = locale === "fr" ? `Vous avez ${amount} de cotisations en attente.` : `You have ${amount} in outstanding contributions.`;
    const { error } = await service.from("notifications").insert({
      user_id: reminder.userId,
      group_id: groupId,
      type: "contribution_due",
      title,
      body: message,
      is_read: false,
      data: { source: "manual_payment_reminder", membershipId, obligationIds: reminder.obligationIds, reminderDate: reminder.reminderDate, link: "/dashboard/my-payments" },
    });
    if (error) return NextResponse.json({ error: "Reminder insert failed" }, { status: 500 });
    sent++;
  }

  return NextResponse.json({ sent, skipped });
}
