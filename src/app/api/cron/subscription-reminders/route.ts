import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { dispatchWhatsApp } from "@/lib/whatsapp-dispatcher";
import { getEnabledChannels } from "@/lib/notification-prefs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/subscription-reminders
 * Vercel Cron — runs daily at 09:00 UTC.
 * Sends reminders for subscriptions expiring within 7 days.
 */
export async function GET(request: Request) {
  // ── Auth: verify CRON_SECRET ──
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let notified = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Find subscriptions expiring within next 7 days
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 86400000);
    const todayStr = now.toISOString().slice(0, 10);
    const futureStr = sevenDaysOut.toISOString().slice(0, 10);

    const { data: expiring, error: queryErr } = await supabase
      .from("group_subscriptions")
      .select(`
        id,
        tier,
        current_period_end,
        group:groups!inner(
          id,
          name
        )
      `)
      .eq("status", "active")
      .gte("current_period_end", todayStr)
      .lte("current_period_end", futureStr);

    if (queryErr) {
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!expiring || expiring.length === 0) {
      return NextResponse.json({ message: "No expiring subscriptions", notified: 0 });
    }

    for (const sub of expiring) {
      try {
        const group = sub.group as unknown as Record<string, unknown>;
        const groupId = group?.id as string;
        const groupName = (group?.name as string) || "";
        const tier = (sub.tier as string) || "free";
        const periodEnd = sub.current_period_end as string;
        const daysLeft = Math.max(0, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86400000));

        // Get group admins
        const { data: admins } = await supabase
          .from("memberships")
          .select("user_id, profiles:profiles!memberships_user_id_fkey(full_name, email, phone)")
          .eq("group_id", groupId)
          .in("role", ["owner", "admin"])
          .not("user_id", "is", null);

        if (!admins || admins.length === 0) continue;

        // Check if we already notified for this subscription period (idempotency)
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("group_id", groupId)
          .eq("type", "system")
          .like("title", "%subscription%expir%")
          .gte("created_at", new Date(now.getTime() - 86400000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue; // Already notified today

        for (const admin of admins) {
          const userId = admin.user_id as string;
          const profile = (Array.isArray(admin.profiles) ? admin.profiles[0] : admin.profiles) as Record<string, unknown> | null;
          const email = (profile?.email as string) || null;
          const phone = (profile?.phone as string) || null;
          const fullName = (profile?.full_name as string) || "";

          // Fetch notification preferences (fail-open)
          let channels = { in_app: true, email: true, sms: true, whatsapp: true, push: false };
          try {
            channels = await getEnabledChannels(supabase, userId, "subscription_updates", groupId);
          } catch { /* fail-open: use defaults */ }

          // In-app notification (always enabled)
          if (channels.in_app) {
            try {
              await supabase.from("notifications").insert({
                user_id: userId,
                group_id: groupId,
                type: "system",
                title: `Your ${tier} subscription expires in ${daysLeft} days`,
                body: `${groupName}: Renew to keep your features.`,
                is_read: false,
                data: { link: "/dashboard/settings" },
              });
            } catch { /* best-effort */ }
          }

          // Email (only if channel enabled)
          if (email && channels.email) {
            try {
              await sendEmail({
                to: email,
                template: "notification",
                data: {
                  title: `Subscription expiring in ${daysLeft} days`,
                  body: `Your ${tier} plan for ${groupName} expires on ${periodEnd}. Renew to keep all your features.`,
                  groupName,
                  ctaText: "Renew Now",
                  ctaUrl: `https://villageclaq.com/en/dashboard/settings/billing`,
                },
                locale: "en",
              });
            } catch { /* best-effort */ }
          }

          // SMS (only if channel enabled)
          if (phone && channels.sms) {
            try {
              await sendSmsNotification({
                to: phone,
                template: "subscription-expiring",
                data: { planName: tier, days: String(daysLeft) },
                locale: "en",
              });
            } catch { /* best-effort */ }
          }

          // WhatsApp (only if channel enabled)
          if (phone && channels.whatsapp) {
            try {
              await dispatchWhatsApp("subscription_expiring", phone, "en", {
                planName: tier,
                days: String(daysLeft),
                memberName: fullName,
              });
            } catch { /* best-effort */ }
          }

          notified++;
        }
      } catch (err) {
        failed++;
        errors.push(err instanceof Error ? err.message : "Unknown error");
      }
    }

    return NextResponse.json({
      message: `Subscription reminders sent`,
      notified,
      failed,
      errors: errors.slice(0, 5),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
