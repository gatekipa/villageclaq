import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { dispatchWhatsApp } from "@/lib/whatsapp-dispatcher";
import { getEnabledChannels } from "@/lib/notification-prefs";
import type { EnabledChannels } from "@/lib/notification-prefs";
import { buildTranslator } from "@/lib/cron-notify-helper";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/hosting-reminders
 * Vercel Cron — runs daily at 07:00 UTC.
 * Sends hosting reminder notifications for assignments within the next 7 days.
 *
 * Dedup: checks notifications table for existing hosting_reminder with matching
 * assignment date in the body. Each assignment only triggers one reminder.
 *
 * Channels: In-App (always), Email, SMS, WhatsApp (per member preferences).
 * Proxy members (user_id = NULL): skip email, send SMS/WhatsApp if phone exists.
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
  const todayStr = now.toISOString().slice(0, 10);
  const in7days = new Date(now.getTime() + 7 * 86400000);
  const in7daysStr = in7days.toISOString().slice(0, 10);

  let groupsChecked = 0;
  let remindersSent = 0;
  let alreadyNotified = 0;
  let smsSent = 0;
  const errors: string[] = [];

  // Bilingual translator scoped to the cron notifications namespace.
  // Loaded once for the whole cron run.
  const bt = await buildTranslator("cron");

  try {
    // ── 1. Query ALL active groups ──
    const { data: groups, error: groupErr } = await supabase
      .from("groups")
      .select("id, name, locale")
      .eq("is_active", true);

    if (groupErr) {
      return NextResponse.json(
        { success: false, error: groupErr.message },
        { status: 500 },
      );
    }

    if (!groups || groups.length === 0) {
      return NextResponse.json({
        success: true,
        groups_checked: 0,
        reminders_sent: 0,
        already_notified: 0,
        message: "No active groups",
      });
    }

    // ── 2. For each group, find upcoming hosting assignments within 7 days ──
    for (const group of groups) {
      groupsChecked++;
      const groupId = group.id as string;
      const groupName = (group.name as string) || "";
      const groupLocale = ((group.locale as string) || "en") as "en" | "fr";

      // Query upcoming assignments for this group
      const { data: assignments, error: assignErr } = await supabase
        .from("hosting_assignments")
        .select(`
          id,
          membership_id,
          assigned_date,
          roster_id,
          membership:memberships!inner(
            id,
            user_id,
            display_name,
            is_proxy,
            privacy_settings,
            profiles:profiles!memberships_user_id_fkey(
              full_name,
              phone,
              preferred_locale
            )
          )
        `)
        .eq("status", "upcoming")
        .gte("assigned_date", todayStr)
        .lte("assigned_date", in7daysStr)
        .in(
          "roster_id",
          (
            await supabase
              .from("hosting_rosters")
              .select("id")
              .eq("group_id", groupId)
              .eq("is_active", true)
          ).data?.map((r) => r.id) || [],
        );

      if (assignErr) {
        errors.push(`Group ${groupId}: ${assignErr.message}`);
        continue;
      }

      if (!assignments || assignments.length === 0) continue;

      // Get phone map for proxy members
      const { data: phoneMembers } = await supabase
        .rpc("get_member_phones", { p_group_id: groupId });
      const phoneMap = new Map<string, string>();
      if (phoneMembers && Array.isArray(phoneMembers)) {
        for (const mp of phoneMembers) {
          const row = mp as { user_id: string; phone: string; is_proxy: boolean };
          if (row.user_id && row.phone) {
            phoneMap.set(row.user_id, row.phone);
          }
        }
      }

      // Get email map
      const { data: emailMembers } = await supabase
        .rpc("get_member_emails", { p_group_id: groupId });
      const emailMap = new Map<string, string>();
      if (emailMembers && Array.isArray(emailMembers)) {
        for (const m of emailMembers) {
          const row = m as { user_id: string; email: string };
          if (row.user_id && row.email) {
            emailMap.set(row.user_id, row.email);
          }
        }
      }

      // ── 3. Process each assignment ──
      for (const a of assignments) {
        const membership = (
          Array.isArray(a.membership) ? a.membership[0] : a.membership
        ) as Record<string, unknown> | null;
        if (!membership) continue;

        const userId = membership.user_id as string | null;
        const isProxy = !!membership.is_proxy;
        const membershipId = membership.id as string;
        const displayName = membership.display_name as string | null;
        const profiles = membership.profiles as
          | Record<string, unknown>
          | Array<Record<string, unknown>>
          | null;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const memberName =
          displayName ||
          (profile?.full_name as string) ||
          "Member";
        const preferredLocale = (
          (profile?.preferred_locale as string) || groupLocale
        ) as "en" | "fr";
        const assignedDate = a.assigned_date as string;

        // Format date for notification body (used for dedup)
        const formattedDate = new Date(assignedDate + "T00:00:00").toLocaleDateString(
          preferredLocale === "fr" ? "fr-FR" : "en-US",
          { year: "numeric", month: "short", day: "numeric" },
        );

        // ── 3a. Dedup: check if reminder already sent ──
        if (userId) {
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("group_id", groupId)
            .eq("type", "hosting_reminder")
            .like("body", `%${assignedDate}%`)
            .limit(1);

          if (existing && existing.length > 0) {
            alreadyNotified++;
            continue;
          }
        }

        // ── 3b. Check member notification preferences ──
        let channels: EnabledChannels = {
          in_app: true,
          email: true,
          sms: true,
          whatsapp: true,
          push: false,
        };
        if (userId) {
          try {
            channels = await getEnabledChannels(
              supabase,
              userId,
              "hosting_reminders",
              groupId,
            );
          } catch {
            // Fail-open: use defaults
          }
        }

        // Resolve phone for this member
        let phone: string | null = null;
        if (userId && phoneMap.has(userId)) {
          phone = phoneMap.get(userId)!;
        } else if (isProxy) {
          const privacySettings = membership.privacy_settings as Record<string, unknown> | null;
          phone = (privacySettings?.proxy_phone as string) || null;
        }

        // Title + body rendered in the recipient's preferred locale via
        // the bilingual translator. Previously hardcoded EN/FR literals
        // in the cron route — now sourced from messages/{en,fr}.json so
        // translations live in one place.
        const title = bt(preferredLocale, "hostingReminderTitle");
        const body = bt(preferredLocale, "hostingReminderBody", { date: formattedDate });

        // ── 3c. In-App notification (always, only for real users) ──
        if (userId) {
          try {
            await supabase.from("notifications").insert({
              group_id: groupId,
              user_id: userId,
              type: "hosting_reminder",
              title,
              body,
              is_read: false,
              data: { link: "/dashboard/my-hosting" },
            });
          } catch {
            errors.push(`In-app failed for membership ${membershipId}`);
          }
        }

        const templateData = {
          memberName,
          groupName,
          hostingDate: formattedDate,
          date: formattedDate,
          location: "",
        };

        // ── 3d. Email (skip for proxy members) ──
        if (!isProxy && userId && channels.email) {
          const email = emailMap.get(userId);
          if (email) {
            try {
              await sendEmail({
                to: email,
                template: "notification",
                data: { title, body, ...templateData },
                locale: preferredLocale,
              });
            } catch {
              errors.push(`Email failed for ${membershipId}`);
            }
          }
        }

        // ── 3e. SMS (real + proxy members with phones) ──
        if (phone && channels.sms) {
          try {
            const result = await sendSmsNotification({
              to: phone,
              template: "hosting-reminder",
              data: templateData,
              locale: preferredLocale,
            });
            if (result.sent) smsSent++;
          } catch {
            errors.push(`SMS failed for ${membershipId}`);
          }
        }

        // ── 3f. WhatsApp (real + proxy members with phones) ──
        if (phone && channels.whatsapp) {
          try {
            await dispatchWhatsApp(
              "hosting_reminder",
              phone,
              preferredLocale,
              {
                memberName,
                hostingDate: formattedDate,
                groupName,
              },
            );
          } catch {
            // Best-effort
          }
        }

        remindersSent++;
      }
    }

    if (errors.length > 0) {
      console.warn(
        `[Cron:HostingReminders] ${groupsChecked} groups, ${remindersSent} sent, ${alreadyNotified} deduped:`,
        errors.slice(0, 10),
      );
    }

    return NextResponse.json({
      success: true,
      groups_checked: groupsChecked,
      reminders_sent: remindersSent,
      already_notified: alreadyNotified,
      sms_sent: smsSent,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:HostingReminders] Fatal error:", msg);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        groups_checked: groupsChecked,
        reminders_sent: remindersSent,
        already_notified: alreadyNotified,
      },
      { status: 500 },
    );
  }
}
