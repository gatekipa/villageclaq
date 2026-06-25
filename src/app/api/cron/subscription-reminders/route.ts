import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { produceSubscriptionExpiringNotification } from "@/lib/subscription-expiring-producer";
import { getEnabledChannels } from "@/lib/notification-prefs";
import { buildTranslator, fetchLocaleMap, getLocale } from "@/lib/cron-notify-helper";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Candidate-query row ceiling. PostgREST silently caps un-limited selects at
// its max-rows default (1000) with zero signal that rows were dropped — this
// explicit ceiling replaces that silent truncation with a deterministic cut
// (soonest current_period_end first) that is audited (warn + ceilingHit
// response flag). Deferral is safe: the WhatsApp producer is idempotent per
// recipient per day bucket and the dedup_key row dedupes in-app/email/SMS,
// so the next run resumes the remainder without duplicates.
// Keyset pagination over (current_period_end, id) is the upgrade path.
const CANDIDATE_CEILING = 500;

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

/**
 * GET /api/cron/subscription-reminders
 * Vercel Cron — runs daily at 09:00 UTC.
 * Sends reminders for subscriptions expiring within 7 days.
 *
 * Recipients: the billing contacts (group owner/admin memberships).
 * Every title/body is rendered per admin in their preferred_locale
 * via the bilingual translator (cron namespace).
 *
 * In-app/email/SMS are sent directly from this route, deduped by the
 * locale-agnostic `dedup_key` row. WhatsApp is queued exclusively via
 * the subscription-expiring producer (notifications_queue, drained by
 * the queue cron) with its own per-recipient day-bucket idempotency —
 * decoupled from the in-app dedup row, so same-day reruns are safe on
 * both paths independently. No direct WhatsApp provider sends here.
 *
 * Billing state is read-only: this route only SELECTs from
 * group_subscriptions and never writes to it.
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
  let whatsappQueued = 0;
  let whatsappSkipped = 0;
  let whatsappFailed = 0;
  let ceilingHit = false;
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
      .lte("current_period_end", futureStr)
      .order("current_period_end", { ascending: true })
      .order("id", { ascending: true })
      .limit(CANDIDATE_CEILING);

    if (queryErr) {
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!expiring || expiring.length === 0) {
      return NextResponse.json({ message: "No expiring subscriptions", notified: 0 });
    }

    if (expiring.length >= CANDIDATE_CEILING) {
      ceilingHit = true;
      console.warn(`[Cron:SubscriptionReminders] candidate ceiling reached (${CANDIDATE_CEILING}) — remainder deferred to the next run`);
    }

    for (const sub of expiring) {
      // ── WhatsApp: queue-backed producer, called BEFORE the in-app dedup
      // check below. The producer re-validates eligibility, preferences,
      // and phone per billing contact, then enqueues into
      // notifications_queue. Its idempotency is a per-recipient day bucket
      // (subscriptionId + reminderDate + userId), owned by the producer —
      // deliberately decoupled from the dedup_key row so neither channel's
      // dedupe can starve the other.
      try {
        const waResult = await produceSubscriptionExpiringNotification(
          supabase,
          sub.id as string,
          { reminderDate: todayStr },
        );
        whatsappQueued += waResult.whatsappQueued;
        whatsappSkipped += waResult.recipients.filter((r) => r.status === "skipped").length;
        whatsappFailed += waResult.recipients.filter((r) => r.status === "error").length;
        if (waResult.recipients.length === 0) {
          if (waResult.status === "error") {
            whatsappFailed++;
            errors.push(`WhatsApp: ${waResult.reason || "unknown"}`);
          } else {
            whatsappSkipped++;
          }
        }
      } catch (err) {
        whatsappFailed++;
        console.warn(
          `[Cron:SubscriptionReminders] whatsapp producer failed for ${shortId(sub.id as string)}:`,
          err instanceof Error ? err.message : err,
        );
      }

      try {
        const group = sub.group as unknown as Record<string, unknown>;
        const groupId = group?.id as string;
        const groupName = (group?.name as string) || "";
        const tier = (sub.tier as string) || "free";
        const periodEnd = sub.current_period_end as string;
        // Calendar-day difference at UTC midnight — the same bucket math
        // the WhatsApp producer uses, so every channel in this run shows
        // the same countdown number regardless of period_end's time-of-day.
        const daysLeft = Math.max(
          0,
          Math.round(
            (new Date(`${periodEnd.slice(0, 10)}T00:00:00.000Z`).getTime() -
              new Date(`${todayStr}T00:00:00.000Z`).getTime()) / 86400000,
          ),
        );

        // Get group owner/admin memberships
        const { data: admins } = await supabase
          .from("memberships")
          .select(
            "user_id, profiles:profiles!memberships_user_id_fkey(email, phone)",
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

        // Idempotency: skip if we already fired this reminder for this
        // group + expiry window. `dedup_key` is a locale-agnostic string
        // indexed via idx_notifications_dedup (migration 00083). Replaces
        // the old `title LIKE '%subscription%expir%'` pattern which broke
        // silently whenever a third locale was added.
        const dedupKey = `subscription_expiring_${groupId}_${daysLeft}`;
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("group_id", groupId)
          .eq("dedup_key", dedupKey)
          .gte("created_at", new Date(now.getTime() - 86400000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Track whether an in-app insert wrote the dedup_key row for this
        // (group, window). The marker was previously ONLY written inside the
        // in_app branch, so if every admin disabled in-app no marker existed and
        // the NEXT run would resend email/SMS. A silent fallback marker (below)
        // guarantees dedup independently of the in_app preference.
        let inAppDeduped = false;

        for (const admin of admins) {
          const userId = admin.user_id as string;
          const profile = (Array.isArray(admin.profiles)
            ? admin.profiles[0]
            : admin.profiles) as Record<string, unknown> | null;
          const email = (profile?.email as string) || null;
          const phone = (profile?.phone as string) || null;
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
                dedup_key: dedupKey,
              });
              inAppDeduped = true;
            } catch (err) {
              console.warn(
                `[Cron:SubscriptionReminders] in-app failed for ${shortId(userId)}:`,
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
                `[Cron:SubscriptionReminders] email failed for ${shortId(userId)}:`,
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
                `[Cron:SubscriptionReminders] sms failed for ${shortId(userId)}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }

          // WhatsApp is handled by the queue-backed producer above — no
          // direct provider sends from this cron.

          notified++;
        }

        // Idempotency fallback — independent of channel preferences. If no
        // in-app insert carried the dedup_key (every admin opted out of in-app,
        // or those inserts failed), write ONE silent ledger row so the next run
        // skips this (group, window) and does NOT resend email/SMS. is_read:true
        // keeps it from badging; `dedup_marker` flags it as a non-user-facing
        // record. This writes a DB row only — it sends nothing.
        if (!inAppDeduped && adminUserIds.length > 0) {
          const markerUserId = adminUserIds[0];
          const markerLocale = getLocale(localeMap, markerUserId);
          try {
            await supabase.from("notifications").insert({
              user_id: markerUserId,
              group_id: groupId,
              type: "system",
              title: bt(markerLocale, "subscriptionExpiringInAppTitle", { tier, days: daysLeft }),
              body: bt(markerLocale, "subscriptionExpiringInAppBody", { groupName }),
              is_read: true,
              data: { link: "/dashboard/settings", dedup_marker: true },
              dedup_key: dedupKey,
            });
          } catch (err) {
            console.warn(
              `[Cron:SubscriptionReminders] dedup-marker insert failed for group ${shortId(groupId)}:`,
              err instanceof Error ? err.message : err,
            );
          }
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
      whatsappQueued,
      whatsappSkipped,
      whatsappFailed,
      ceilingHit,
      errors: errors.slice(0, 5),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg, notified, failed, whatsappQueued, whatsappSkipped, whatsappFailed, ceilingHit },
      { status: 500 },
    );
  }
}
