import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { dispatchWhatsApp } from "@/lib/whatsapp-dispatcher";
import { getEnabledChannels } from "@/lib/notification-prefs";
import { buildTranslator, fetchLocaleMap, getLocale } from "@/lib/cron-notify-helper";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/subscription-reminders
 * Vercel Cron — runs daily at 09:00 UTC.
 * Sends reminders for subscriptions expiring within 7 days.
 *
 * Recipients: the billing contacts (group owner/admin memberships).
 * Every title/body is rendered per admin in their preferred_locale
 * via the bilingual translator (cron namespace).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const bt = await buildTranslator("cron");
  let notified = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
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
        const daysLeft = Math.max(
          0,
          Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86400000),
        );

        // Get group owner/admin memberships
        const { data: admins } = await supabase
          .from("memberships")
          .select(
            "user_id, profiles:profiles!memberships_user_id_fkey(full_name, email, phone)",
          )
          .eq("group_id", groupId)
          .in("role", ["owner", "admin"])
          .not("user_id", "is", null);

        if (!admins || admins.length === 0) continue;

        // Batch-fetch preferred_locale for every admin in one query.
        const adminUserIds = admins
          .map((a) => a.user_id as string | null)
          .filter((id): id is string => !!id);
        const localeMap = await fetchLocaleMap(supabase, adminUserIds);

        // Idempotency: skip if we already fired a subscription reminder
        // for this group in the last 24h. Uses group_id + type="system"
        // + title LIKE as the dedup key — independent of locale.
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("group_id", groupId)
          .eq("type", "system")
          .or("title.ilike.%subscription%expir%,title.ilike.%abonnement%expir%")
          .gte("created_at", new Date(now.getTime() - 86400000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        for (const admin of admins) {
          const userId = admin.user_id as string;
          const profile = (Array.isArray(admin.profiles)
            ? admin.profiles[0]
            : admin.profiles) as Record<string, unknown> | null;
          const email = (profile?.email as string) || null;
          const phone = (profile?.phone as string) || null;
          const fullName = (profile?.full_name as string) || "";
          const locale = getLocale(localeMap, userId);

          // Fail-open channel preferences
          let channels = { in_app: true, email: true, sms: true, whatsapp: true, push: false };
          try {
            channels = await getEnabledChannels(supabase, userId, "subscription_updates", groupId);
          } catch {
            /* fail-open: use defaults */
          }

          // Locale-aware billing URL. The /{locale}/ prefix matches the
          // route structure; using "en" for English keeps backwards
          // compatibility with existing email links.
          const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com"}/${locale}/dashboard/settings/billing`;

          const inAppTitle = bt(locale, "subscriptionExpiringInAppTitle", {
            tier,
            days: daysLeft,
          });
          const inAppBody = bt(locale, "subscriptionExpiringInAppBody", { groupName });
          const emailTitle = bt(locale, "subscriptionExpiringEmailTitle", { days: daysLeft });
          const emailBody = bt(locale, "subscriptionExpiringEmailBody", {
            tier,
            groupName,
            date: periodEnd,
          });
          const ctaText = bt(locale, "renewNow");

          // In-app (always if enabled)
          if (channels.in_app) {
            try {
              await supabase.from("notifications").insert({
                user_id: userId,
                group_id: groupId,
                type: "system",
                title: inAppTitle,
                body: inAppBody,
                is_read: false,
                data: { link: "/dashboard/settings" },
              });
            } catch (err) {
              console.warn(
                `[Cron:SubscriptionReminders] in-app failed for ${userId}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }

          // Email
          if (email && channels.email) {
            try {
              await sendEmail({
                to: email,
                template: "notification",
                data: {
                  title: emailTitle,
                  body: emailBody,
                  groupName,
                  ctaText,
                  ctaUrl: billingUrl,
                },
                locale,
              });
            } catch (err) {
              console.warn(
                `[Cron:SubscriptionReminders] email failed for ${userId}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }

          // SMS — locale picked up by the localized template
          if (phone && channels.sms) {
            try {
              await sendSmsNotification({
                to: phone,
                template: "subscription-expiring",
                data: { planName: tier, days: String(daysLeft) },
                locale,
              });
            } catch (err) {
              console.warn(
                `[Cron:SubscriptionReminders] sms failed for ${userId}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }

          // WhatsApp — locale passed through to the dispatcher
          if (phone && channels.whatsapp) {
            try {
              await dispatchWhatsApp("subscription_expiring", phone, locale, {
                planName: tier,
                days: String(daysLeft),
                memberName: fullName,
              });
            } catch (err) {
              console.warn(
                `[Cron:SubscriptionReminders] whatsapp failed for ${userId}:`,
                err instanceof Error ? err.message : err,
              );
            }
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
