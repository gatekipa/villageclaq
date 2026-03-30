import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
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
  let smsSent = 0;
  let smsSkipped = 0;
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

    // ── Resolve emails + phones via RPC — one call per group ──
    // Collect unique group_ids from obligations
    const groupIds = new Set<string>();
    for (const o of realObligations) {
      const membership = (Array.isArray(o.membership) ? o.membership[0] : o.membership) as Record<string, unknown>;
      const gid = membership.group_id as string;
      if (gid) groupIds.add(gid);
    }

    const emailMap = new Map<string, string>();
    const phoneMap = new Map<string, { phone: string; locale: string }>();

    // Batch resolve — one RPC call per group for emails and phones
    for (const gid of groupIds) {
      // Emails
      const { data: members, error: rpcErr } = await supabase
        .rpc("get_member_emails", { p_group_id: gid });
      if (rpcErr) {
        console.warn(`[Cron:PaymentReminders] get_member_emails failed for group ${gid}:`, rpcErr.message);
      } else if (members && Array.isArray(members)) {
        for (const m of members) {
          const row = m as { user_id: string; email: string };
          if (row.user_id && row.email) {
            emailMap.set(row.user_id, row.email);
          }
        }
      }

      // Phones
      const { data: phoneMembers, error: phoneErr } = await supabase
        .rpc("get_member_phones", { p_group_id: gid });
      if (phoneErr) {
        console.warn(`[Cron:PaymentReminders] get_member_phones failed for group ${gid}:`, phoneErr.message);
      } else if (phoneMembers && Array.isArray(phoneMembers)) {
        for (const m of phoneMembers) {
          const row = m as { user_id: string; phone: string; preferred_locale: string; is_proxy: boolean };
          if (row.user_id && row.phone && !row.is_proxy) {
            phoneMap.set(row.user_id, { phone: row.phone, locale: row.preferred_locale || "en" });
          }
        }
      }
    }

    // ── Send emails + SMS per member per overdue obligation ──
    const emailPromises: Promise<{ userId: string; success: boolean; error?: string }>[] = [];
    const smsPromises: Promise<{ sent: boolean; skipped: boolean }>[] = [];

    for (const [userId, memberData] of byUser) {
      const email = emailMap.get(userId);
      const phoneInfo = phoneMap.get(userId);

      if (!email && !phoneInfo) {
        errors.push(`No email or phone found for user ${userId}`);
        failed++;
        continue;
      }

      // Send one email + one SMS per overdue obligation
      for (const item of memberData.items) {
        const templateData = {
          memberName: memberData.memberName,
          groupName: item.groupName,
          amount: item.amount,
          contributionType: item.contributionType,
          dueDate: item.dueDate,
          daysOverdue: item.daysOverdue,
          paymentsUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com"}/dashboard/my-payments`,
        };

        // Email
        if (email) {
          emailPromises.push(
            sendEmail({
              to: email,
              template: "payment-reminder",
              data: templateData,
              locale: memberData.locale,
            }).then((result) => ({
              userId,
              success: result.success,
              error: result.error,
            }))
          );
        }

        // SMS (fire-and-forget alongside email)
        if (phoneInfo) {
          smsPromises.push(
            sendSmsNotification({
              to: phoneInfo.phone,
              template: "payment-reminder",
              data: templateData,
              locale: (phoneInfo.locale || memberData.locale) as "en" | "fr",
            })
          );
        }
      }
    }

    // Wait for emails (primary channel)
    const results = await Promise.allSettled(emailPromises);
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

    // Wait for SMS (secondary channel — failures don't affect response)
    const smsResults = await Promise.allSettled(smsPromises);
    for (const r of smsResults) {
      if (r.status === "fulfilled" && r.value.sent) smsSent++;
      else if (r.status === "fulfilled" && r.value.skipped) smsSkipped++;
    }

    if (errors.length > 0) {
      console.warn(`[Cron:PaymentReminders] ${sent} emails sent, ${failed} failed, ${smsSent} SMS sent:`, errors.slice(0, 10));
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      smsSent,
      smsSkipped,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:PaymentReminders] Fatal error:", msg);
    return NextResponse.json({ success: false, error: msg, sent, failed, smsSent, smsSkipped }, { status: 500 });
  }
}
