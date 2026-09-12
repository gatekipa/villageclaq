import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { produceHostingReminderNotification } from "@/lib/hosting-reminder-producer";
import type { HostingReminderProducerResult } from "@/lib/hosting-reminder-producer";
import { buildTranslator } from "@/lib/cron-notify-helper";

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
 * Enqueues hosting reminders via the producer (ALLOW channels: WA + SMS).
 * hosting_reminder email is DENY — do not send email. No happy-path
 * SMS/email provider send — drain is the only sender.
 *
 * In-app dedup for real users: a notifications.dedup_key check
 * ("hosting_reminder_<assignmentId>_<assignedDate>", ISO date).
 * The in-app row is inserted with the valid "system" enum value.
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

      // ── 3. Process each assignment ──
      for (const a of assignments) {
        const membership = (
          Array.isArray(a.membership) ? a.membership[0] : a.membership
        ) as Record<string, unknown> | null;
        if (!membership) continue;

        const assignmentId = a.id as string;
        const userId = membership.user_id as string | null;
        const membershipId = membership.id as string;
        const profiles = membership.profiles as
          | Record<string, unknown>
          | Array<Record<string, unknown>>
          | null;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
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

        // Title + body rendered in the recipient's preferred locale via
        // the bilingual translator, sourced from messages/{en,fr}.json.
        const title = bt(preferredLocale, "hostingReminderTitle");
        const body = bt(preferredLocale, "hostingReminderBody", { date: formattedDate });

        // Proxy members: no user_id, so no in-app notification. SMS/WA
        // are enqueued by the producer above (drain sends).
        if (!userId) {
          if (waResult?.status === "queued") {
            remindersSent++;
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
