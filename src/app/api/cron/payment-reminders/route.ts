import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { formatAmount } from "@/lib/currencies";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/payment-reminders
 * Vercel Cron — runs daily at 08:00 UTC.
 * Sends payment reminder emails for overdue/pending obligations.
 */
export async function GET(request: Request) {
  // ── Auth: verify CRON_SECRET ──
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // ── Query overdue obligations with member + group + type data ──
    const { data: obligations, error: queryErr } = await supabase
      .from("contribution_obligations")
      .select(`
        id,
        amount,
        amount_paid,
        currency,
        due_date,
        status,
        membership:memberships!inner(
          id,
          user_id,
          display_name,
          is_proxy,
          group_id,
          profiles!memberships_user_id_fkey(
            full_name,
            preferred_locale
          )
        ),
        contribution_type:contribution_types!inner(
          name,
          name_fr
        ),
        group:groups!inner(
          name
        )
      `)
      .in("status", ["pending", "partial", "overdue"])
      .lt("due_date", now.toISOString().split("T")[0]);

    if (queryErr) {
      return NextResponse.json(
        { success: false, error: queryErr.message },
        { status: 500 }
      );
    }

    if (!obligations || obligations.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, message: "No overdue obligations" });
    }

    // ── Filter out proxy members (user_id IS NULL) ──
    const realObligations = obligations.filter((o: Record<string, unknown>) => {
      const raw = o.membership;
      const m = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
      return m && m.user_id && !m.is_proxy;
    });

    if (realObligations.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, message: "No overdue obligations for real members" });
    }

    // ── Group by user_id → one email per member with all their overdue items ──
    const byUser = new Map<string, {
      userId: string;
      memberName: string;
      locale: "en" | "fr";
      items: Array<{
        contributionType: string;
        amount: string;
        dueDate: string;
        daysOverdue: number;
        groupName: string;
      }>;
    }>();

    for (const o of realObligations) {
      const membership = (Array.isArray(o.membership) ? o.membership[0] : o.membership) as Record<string, unknown>;
      const userId = membership.user_id as string;
      const profiles = membership.profiles as Record<string, unknown> | Array<Record<string, unknown>> | null;
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      const memberName = (membership.display_name as string)
        || (profile?.full_name as string)
        || "Member";
      const preferredLocale = ((profile?.preferred_locale as string) || "en") as "en" | "fr";

      const ct = (Array.isArray(o.contribution_type) ? o.contribution_type[0] : o.contribution_type) as Record<string, unknown>;
      const group = (Array.isArray(o.group) ? o.group[0] : o.group) as Record<string, unknown>;
      const typeName = (preferredLocale === "fr" ? (ct.name_fr as string) : null) || (ct.name as string);
      const currency = (o.currency as string) || "XAF";
      const amountDue = Number(o.amount) - Number(o.amount_paid || 0);
      const dueDate = o.due_date as string;
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)));

      if (!byUser.has(userId)) {
        byUser.set(userId, {
          userId,
          memberName,
          locale: preferredLocale,
          items: [],
        });
      }

      byUser.get(userId)!.items.push({
        contributionType: typeName,
        amount: formatAmount(amountDue, currency),
        dueDate,
        daysOverdue,
        groupName: (group.name as string) || "",
      });
    }

    // ── Resolve emails via get_member_emails RPC — one call per group ──
    // Collect unique group_ids from obligations
    const groupIds = new Set<string>();
    for (const o of realObligations) {
      const membership = (Array.isArray(o.membership) ? o.membership[0] : o.membership) as Record<string, unknown>;
      const gid = membership.group_id as string;
      if (gid) groupIds.add(gid);
    }

    const emailMap = new Map<string, string>();

    // Batch resolve — one RPC call per group instead of one auth call per user
    for (const gid of groupIds) {
      const { data: members, error: rpcErr } = await supabase
        .rpc("get_member_emails", { p_group_id: gid });
      if (rpcErr) {
        console.warn(`[Cron:PaymentReminders] get_member_emails failed for group ${gid}:`, rpcErr.message);
        continue;
      }
      if (members && Array.isArray(members)) {
        for (const m of members) {
          const row = m as { user_id: string; email: string };
          if (row.user_id && row.email) {
            emailMap.set(row.user_id, row.email);
          }
        }
      }
    }

    // ── Send one email per member (first overdue item as primary, rest as context) ──
    // The template handles a single obligation per email, so we send one per overdue item
    const sendPromises: Promise<{ userId: string; success: boolean; error?: string }>[] = [];

    for (const [userId, memberData] of byUser) {
      const email = emailMap.get(userId);
      if (!email) {
        errors.push(`No email found for user ${userId}`);
        failed++;
        continue;
      }

      // Send one email per overdue obligation
      for (const item of memberData.items) {
        sendPromises.push(
          sendEmail({
            to: email,
            template: "payment-reminder",
            data: {
              memberName: memberData.memberName,
              groupName: item.groupName,
              amount: item.amount,
              contributionType: item.contributionType,
              dueDate: item.dueDate,
              daysOverdue: item.daysOverdue,
              paymentsUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com"}/dashboard/my-payments`,
            },
            locale: memberData.locale,
          }).then((result) => ({
            userId,
            success: result.success,
            error: result.error,
          }))
        );
      }
    }

    const results = await Promise.allSettled(sendPromises);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        sent++;
      } else {
        failed++;
        const errMsg = r.status === "fulfilled"
          ? r.value.error || "Unknown"
          : (r.reason as Error)?.message || "Unknown";
        errors.push(errMsg);
      }
    }

    if (errors.length > 0) {
      console.warn(`[Cron:PaymentReminders] ${sent} sent, ${failed} failed:`, errors.slice(0, 10));
    }

    return NextResponse.json({ success: true, sent, failed, errors: errors.slice(0, 20) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:PaymentReminders] Fatal error:", msg);
    return NextResponse.json({ success: false, error: msg, sent, failed }, { status: 500 });
  }
}
