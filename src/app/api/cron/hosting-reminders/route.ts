import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { produceHostingReminderNotification } from "@/lib/hosting-reminder-producer";
import type { HostingReminderProducerResult } from "@/lib/hosting-reminder-producer";
import { getEnabledChannels } from "@/lib/notification-prefs";
import type { EnabledChannels } from "@/lib/notification-prefs";
import { buildTranslator } from "@/lib/cron-notify-helper";
import { fetchMemberDispatchContacts } from "@/lib/cron-member-contacts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Candidate-query bounds. PostgREST silently caps un-limited selects at its
// max-rows default (1000) with zero signal that rows were dropped — these
// explicit bounds replace that silent truncation with audited behavior
// (warn + ceiling_hit response flag).
// - Groups: paginated with .range() to exhaustion (a plain LIMIT would
//   permanently exclude groups beyond the cut — groups never leave
//   candidacy by being processed). MAX_GROUP_PAGES is a runaway backstop.
// - Assignments (per group): bounded by ASSIGNMENT_CANDIDATE_CEILING.
//   Idempotency (strict per (assignmentId, assignedDate) queue key +
//   dedup_key rows) prevents DUPLICATES on re-selection, but
//   already-notified assignments still occupy slots until their date exits
//   the 7-day window — so under per-group saturation, later assignments are
//   reached with reduced notice, and >ceiling assignments sharing one
//   assigned_date can starve. ceiling_hit is the operator cue; a
//   dedup-aware candidate filter is the upgrade path at scale.
const GROUP_CANDIDATE_CEILING = 500;
const MAX_GROUP_PAGES = 10;
const ASSIGNMENT_CANDIDATE_CEILING = 200;

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

/**
 * GET /api/cron/hosting-reminders
 * Vercel Cron — runs daily at 07:00 UTC.
 * Sends hosting reminder notifications for assignments within the next 7 days.
 *
 * WhatsApp is queued exclusively via produceHostingReminderNotification
 * (notifications_queue, drained by the queue cron) — no direct provider
 * sends from this route. The producer is strictly idempotent per
 * (assignmentId, assignedDate), fixing the legacy duplicate daily sends.
 *
 * In-app/email/SMS dedup for real users: a notifications.dedup_key check
 * ("hosting_reminder_<assignmentId>_<assignedDate>", ISO date). This
 * replaces the legacy body-LIKE match that compared the ISO
 * assigned_date against a locale-FORMATTED date inside the body — it
 * never matched, so every daily run inside the 7-day window re-sent.
 * The in-app row is inserted with the valid "system" enum value — the
 * legacy insert used a value missing from the notification_type enum,
 * so the insert always failed (which is also why its dedup never had a
 * row to find).
 *
 * Channels: In-App + Email + SMS direct (per member preferences),
 * WhatsApp via the queue-backed producer.
 * Proxy members (user_id = NULL): no in-app/email/dedup row is possible —
 * the producer's first-enqueue result doubles as the once-per-
 * (assignment, date) marker for proxy SMS.
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
  let whatsappQueued = 0;
  let whatsappSkipped = 0;
  let whatsappFailed = 0;
  let ceilingHit = false;
  const errors: string[] = [];

  // Bilingual translator scoped to the cron notifications namespace.
  // Loaded once for the whole cron run.
  const bt = await buildTranslator("cron");

  try {
    // ── 1. Query ALL active groups — paginated to exhaustion ──
    // Groups never leave this candidate set by being processed, so a plain
    // LIMIT would permanently exclude groups beyond the cut (not defer
    // them). Page with .range() until a short page instead; the page cap is
    // a runaway backstop only, and exhausting it is loudly audited.
    const groups: Array<Record<string, unknown>> = [];
    for (let page = 0; page < MAX_GROUP_PAGES; page++) {
      const from = page * GROUP_CANDIDATE_CEILING;
      const { data: groupPage, error: groupErr } = await supabase
        .from("groups")
        .select("id, name, locale")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, from + GROUP_CANDIDATE_CEILING - 1);

      if (groupErr) {
        return NextResponse.json(
          { success: false, error: groupErr.message },
          { status: 500 },
        );
      }
      groups.push(...(groupPage || []));
      if (!groupPage || groupPage.length < GROUP_CANDIDATE_CEILING) break;
      if (page === MAX_GROUP_PAGES - 1) {
        ceilingHit = true;
        console.warn(`[Cron:HostingReminders] group page cap reached (${MAX_GROUP_PAGES} x ${GROUP_CANDIDATE_CEILING}) — active groups beyond the cap are SKIPPED this run (see ceiling_hit)`);
      }
    }

    if (groups.length === 0) {
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
        )
        .order("assigned_date", { ascending: true })
        .order("id", { ascending: true })
        .limit(ASSIGNMENT_CANDIDATE_CEILING);

      if (assignErr) {
        errors.push(`Group ${shortId(groupId)}: ${assignErr.message}`);
        continue;
      }

      if (!assignments || assignments.length === 0) continue;

      if (assignments.length >= ASSIGNMENT_CANDIDATE_CEILING) {
        ceilingHit = true;
        console.warn(`[Cron:HostingReminders] assignment candidate ceiling reached (${ASSIGNMENT_CANDIDATE_CEILING}) for group ${shortId(groupId)} — later assignments get reduced notice while the window slides (see ceiling_hit)`);
      }

      // Get phone map for real members. Proxy phones are read from the
      // assignment membership row below.
      const phoneMap = new Map<string, string>();
      try {
        const phoneMembers = await fetchMemberDispatchContacts(supabase, groupId);
        for (const row of phoneMembers) {
          if (row.userId && row.phone && !row.isProxy) {
            phoneMap.set(row.userId, row.phone);
          }
        }
      } catch (err) {
        console.warn(`[Cron:HostingReminders] member phone lookup failed for group ${shortId(groupId)}:`, err instanceof Error ? err.message : err);
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

        const assignmentId = a.id as string;
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

        // Display-only formatted date for notification copy. Dedup never
        // uses this — dedup keys use the raw ISO assigned_date.
        const formattedDate = new Date(assignedDate + "T00:00:00").toLocaleDateString(
          preferredLocale === "fr" ? "fr-FR" : "en-US",
          { year: "numeric", month: "short", day: "numeric" },
        );

        // ── 3a. WhatsApp: queue-backed producer (idempotent per
        // assignment + scheduled date — same-window reruns are no-ops) ──
        let waResult: HostingReminderProducerResult | null = null;
        try {
          // locale: groupLocale preserves the legacy fallback chain
          // (profile.preferred_locale || group locale) for proxies and
          // members without a preferred_locale — the producer's own
          // fallback would otherwise hard-default to "en".
          waResult = await produceHostingReminderNotification(supabase, assignmentId, {
            todayDate: todayStr,
            locale: groupLocale,
          });
          if (waResult.status === "queued") {
            whatsappQueued++;
          } else if (waResult.status === "skipped") {
            whatsappSkipped++;
          } else {
            whatsappFailed++;
            errors.push(`WhatsApp: ${waResult.reason || "unknown"} for assignment ${shortId(assignmentId)}`);
          }
        } catch (err) {
          whatsappFailed++;
          const msg = err instanceof Error ? err.message : "unknown";
          console.warn(`[Cron:HostingReminders] WhatsApp producer failed for assignment ${shortId(assignmentId)}:`, msg);
          errors.push(`WhatsApp: ${msg} for assignment ${shortId(assignmentId)}`);
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
          } catch (err) {
            // Fail-open: use defaults
            console.warn(`[Cron:HostingReminders] preference lookup failed for user ${shortId(userId)}:`, err instanceof Error ? err.message : err);
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
        // the bilingual translator, sourced from messages/{en,fr}.json.
        const title = bt(preferredLocale, "hostingReminderTitle");
        const body = bt(preferredLocale, "hostingReminderBody", { date: formattedDate });

        const templateData = {
          memberName,
          groupName,
          hostingDate: formattedDate,
          date: formattedDate,
          location: "",
        };

        // ── 3c. Proxy members: no user_id, so no in-app notification and
        // no dedup_key row is possible. The producer's first-enqueue
        // result doubles as the once-per-(assignment, date) marker: SMS
        // fires only on the run that first queued the WhatsApp reminder,
        // so daily reruns inside the 7-day window never re-text.
        // This makes proxy SMS deliberately AT-MOST-ONCE: if the process
        // dies between the queue insert and the SMS call, or this run's
        // SMS attempt fails, no later run re-texts (re-texting would
        // reintroduce the duplicate-send bug this PR fixes — proxies have
        // no per-channel marker to distinguish "SMS failed" from "SMS
        // sent"). Transport-level SMS failures are retried by the SMS
        // sender's own queue path, and the WhatsApp queue row still
        // delivers via the drain. Known accepted edge: a proxy whose phone
        // is WhatsApp-ineligible never reaches "queued" and thus never
        // gets SMS (sendSmsNotification independently gates non-African
        // numbers before any provider call). ──
        if (!userId) {
          if (waResult?.status === "queued") {
            remindersSent++;
            if (phone && channels.sms) {
              try {
                const result = await sendSmsNotification({
                  to: phone,
                  template: "hosting-reminder",
                  data: templateData,
                  locale: preferredLocale,
                });
                if (result.sent) smsSent++;
              } catch (err) {
                console.warn(`[Cron:HostingReminders] SMS failed for membership ${shortId(membershipId)}:`, err instanceof Error ? err.message : err);
                errors.push(`SMS failed for membership ${shortId(membershipId)}`);
              }
            }
          }
          continue;
        }

        // ── 3d. Cross-channel dedup for real users: locale-agnostic
        // dedup_key on the raw ISO assigned_date ──
        const dedupKey = `hosting_reminder_${assignmentId}_${assignedDate}`;
        const { data: existing, error: dedupReadError } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("dedup_key", dedupKey)
          .limit(1);

        // If the dedup read fails we cannot know whether this assignment was
        // already sent — skip email/SMS for this run rather than risk a
        // duplicate (the strict no-duplicate guarantee beats availability;
        // before migration 00097 there is no unique-index backstop on this
        // key). The next eligible run retries.
        if (dedupReadError) {
          console.warn(`[Cron:HostingReminders] dedup read failed for assignment ${shortId(assignmentId)}:`, dedupReadError.message);
          errors.push(`Dedup read failed for membership ${shortId(membershipId)}`);
          continue;
        }

        if (existing && existing.length > 0) {
          alreadyNotified++;
          continue;
        }

        // ── 3e. In-app notification FIRST — the dedup_key row doubles as
        // the cross-channel send marker. Inserted with the valid "system"
        // enum value (the legacy insert used an enum value missing from
        // notification_type and always failed). ──
        const { error: inAppError } = await supabase.from("notifications").insert({
          group_id: groupId,
          user_id: userId,
          type: "system",
          title,
          body,
          is_read: false,
          dedup_key: dedupKey,
          data: { link: "/dashboard/my-hosting" },
        });

        if (inAppError) {
          if (inAppError.code === "23505") {
            // Unique-violation race: a concurrent run already marked this
            // assignment — treat as already notified, skip email/SMS.
            alreadyNotified++;
            continue;
          }
          // If the marker can't be written we also skip email/SMS: a
          // strict no-duplicate guarantee beats availability for a daily
          // reminder cron. The next run retries while the assignment is
          // still inside the [today, today+7] window; if the failure lands
          // on the assignment's final eligible day there is no later retry
          // and in-app/email/SMS are dropped for it (WhatsApp is unaffected
          // — the producer queued independently above).
          console.warn(`[Cron:HostingReminders] in-app insert failed for assignment ${shortId(assignmentId)}:`, inAppError.message);
          errors.push(`In-app failed for membership ${shortId(membershipId)}`);
          continue;
        }

        remindersSent++;

        // ── 3f. Email (real users only, per preferences) ──
        if (!isProxy && channels.email) {
          const email = emailMap.get(userId);
          if (email) {
            try {
              await sendEmail({
                to: email,
                template: "notification",
                data: { title, body, ...templateData },
                locale: preferredLocale,
              });
            } catch (err) {
              console.warn(`[Cron:HostingReminders] email failed for membership ${shortId(membershipId)}:`, err instanceof Error ? err.message : err);
              errors.push(`Email failed for membership ${shortId(membershipId)}`);
            }
          }
        }

        // ── 3g. SMS (per preferences) ──
        if (phone && channels.sms) {
          try {
            const result = await sendSmsNotification({
              to: phone,
              template: "hosting-reminder",
              data: templateData,
              locale: preferredLocale,
            });
            if (result.sent) smsSent++;
          } catch (err) {
            console.warn(`[Cron:HostingReminders] SMS failed for membership ${shortId(membershipId)}:`, err instanceof Error ? err.message : err);
            errors.push(`SMS failed for membership ${shortId(membershipId)}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      console.warn(
        `[Cron:HostingReminders] ${groupsChecked} groups, ${remindersSent} sent, ${alreadyNotified} deduped, ${whatsappQueued} WhatsApp queued, ${whatsappSkipped} skipped, ${whatsappFailed} failed:`,
        errors.slice(0, 10),
      );
    }

    return NextResponse.json({
      success: true,
      groups_checked: groupsChecked,
      reminders_sent: remindersSent,
      already_notified: alreadyNotified,
      sms_sent: smsSent,
      whatsapp_queued: whatsappQueued,
      whatsapp_skipped: whatsappSkipped,
      whatsapp_failed: whatsappFailed,
      ceiling_hit: ceilingHit,
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
        sms_sent: smsSent,
        whatsapp_queued: whatsappQueued,
        whatsapp_skipped: whatsappSkipped,
        whatsapp_failed: whatsappFailed,
        ceiling_hit: ceilingHit,
      },
      { status: 500 },
    );
  }
}
