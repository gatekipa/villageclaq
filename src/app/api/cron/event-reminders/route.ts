import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/cron/event-reminders
 * Vercel Cron — runs daily at 08:00 UTC.
 * Sends reminder emails for events starting within the next 24–48 hours.
 *
 * Duplicate prevention: The time-window approach (24–48h) ensures each event
 * is only caught once by the daily cron. At 08:00 UTC today, we capture events
 * starting between 08:00 tomorrow and 08:00 the day after. Tomorrow's cron run
 * at 08:00 will look at a different 24h window.
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
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  let eventsProcessed = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  const errors: string[] = [];

  try {
    // ── Query events starting in 24–48 hours ──
    const { data: events, error: queryErr } = await supabase
      .from("events")
      .select(`
        id,
        title,
        title_fr,
        starts_at,
        ends_at,
        location,
        group_id,
        group:groups!inner(name)
      `)
      .gte("starts_at", in24h.toISOString())
      .lt("starts_at", in48h.toISOString())
      .eq("status", "upcoming");

    if (queryErr) {
      return NextResponse.json(
        { success: false, error: queryErr.message },
        { status: 500 }
      );
    }

    if (!events || events.length === 0) {
      return NextResponse.json({
        success: true,
        eventsProcessed: 0,
        emailsSent: 0,
        emailsFailed: 0,
        message: "No events in the 24–48h window",
      });
    }

    // ── Process each event ──
    for (const event of events) {
      const groupId = event.group_id as string;
      const group = (Array.isArray(event.group) ? event.group[0] : event.group) as Record<string, unknown>;
      const groupName = (group?.name as string) || "";
      const startsAt = new Date(event.starts_at as string);

      // Get all non-proxy members + emails for this group in one RPC call
      const { data: memberEmails, error: rpcErr } = await supabase
        .rpc("get_member_emails", { p_group_id: groupId });

      if (rpcErr || !memberEmails || !Array.isArray(memberEmails) || memberEmails.length === 0) {
        if (rpcErr) errors.push(`Group ${groupId}: ${rpcErr.message}`);
        continue;
      }

      // Build and send emails
      const sendPromises = (memberEmails as Array<{ user_id: string; email: string; display_name: string; preferred_locale: string }>)
        .filter((m) => m.user_id && m.email)
        .map((m) => {
          const email = m.email;
          const memberName = m.display_name || "Member";
          const preferredLocale = (m.preferred_locale || "en") as "en" | "fr";

          const eventName = preferredLocale === "fr"
            ? ((event.title_fr as string) || (event.title as string))
            : (event.title as string);

          const eventDate = startsAt.toLocaleDateString(
            preferredLocale === "fr" ? "fr-FR" : "en-US",
            { weekday: "long", year: "numeric", month: "long", day: "numeric" }
          );
          const eventTime = startsAt.toLocaleTimeString(
            preferredLocale === "fr" ? "fr-FR" : "en-US",
            { hour: "2-digit", minute: "2-digit" }
          );

          return sendEmail({
            to: email,
            template: "event-reminder",
            data: {
              memberName,
              groupName,
              eventName,
              eventDate,
              eventTime,
              eventLocation: (event.location as string) || undefined,
              eventsUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com"}/dashboard/events`,
            },
            locale: preferredLocale,
          }).then((result) => ({
            success: result.success,
            error: result.error,
          }));
        });

      const results = await Promise.allSettled(sendPromises);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) {
          emailsSent++;
        } else {
          emailsFailed++;
          const errMsg = r.status === "fulfilled"
            ? r.value.error || "Unknown"
            : (r.reason as Error)?.message || "Unknown";
          errors.push(errMsg);
        }
      }

      eventsProcessed++;
    }

    if (errors.length > 0) {
      console.warn(`[Cron:EventReminders] ${eventsProcessed} events, ${emailsSent} sent, ${emailsFailed} failed:`, errors.slice(0, 10));
    }

    return NextResponse.json({
      success: true,
      eventsProcessed,
      emailsSent,
      emailsFailed,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:EventReminders] Fatal error:", msg);
    return NextResponse.json(
      { success: false, error: msg, eventsProcessed, emailsSent, emailsFailed },
      { status: 500 }
    );
  }
}
