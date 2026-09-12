import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { produceEventReminderNotification } from "@/lib/event-reminder-producer";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Candidate-query row ceiling. PostgREST silently caps un-limited selects at
// its max-rows default (1000) with zero signal that rows were dropped — this
// explicit ceiling replaces that silent truncation with a deterministic cut
// (soonest starts_at first) that is audited (warn + ceilingHit response
// flag). Deferral is safe because this route self-paginates naturally:
// every processed event flips reminder_sent_at and drops out of candidacy,
// so the deferred remainder is picked up by the next run. Keyset pagination
// over (starts_at, id) is the upgrade path at scale.
const CANDIDATE_CEILING = 200;

function shortId(id: unknown): string {
  return id ? `${String(id).slice(0, 8)}...` : "(missing)";
}

/**
 * GET /api/cron/event-reminders
 * Vercel Cron — runs daily at 08:00 UTC.
 * Enqueues event reminders via the producer (all ALLOW channels) for
 * events starting within the next 48 hours. No happy-path email/SMS
 * provider send — drain is the only sender.
 *
 * Uses a `reminder_sent_at` timestamp on the event row to prevent duplicates.
 * Only events where `reminder_sent_at IS NULL` are processed, and the flip
 * is gated on `reminder_sent_at IS NULL` so two runs cannot both flip it
 * or clobber the timestamp. Queue channels are exactly-once via the
 * producer's per-(eventId, userId) idempotency.
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
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  let eventsProcessed = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let smsSent = 0;
  let smsSkipped = 0;
  let whatsappQueued = 0;
  let whatsappSkipped = 0;
  let whatsappFailed = 0;
  let ceilingHit = false;
  const errors: string[] = [];

  try {
    // ── Query events starting in the next 48 hours that haven't been reminded yet ──
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
      .gte("starts_at", now.toISOString())
      .lt("starts_at", in48h.toISOString())
      .eq("status", "upcoming")
      .is("reminder_sent_at", null)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(CANDIDATE_CEILING);

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

    if (events.length >= CANDIDATE_CEILING) {
      ceilingHit = true;
      console.warn(`[Cron:EventReminders] candidate ceiling reached (${CANDIDATE_CEILING}) — remainder deferred to the next run`);
    }

    // ── Process each event: producer enqueue + reminder_sent_at flip ──
    for (const event of events) {
      try {
        const waResult = await produceEventReminderNotification(supabase, event.id as string);
        whatsappQueued += waResult.whatsappQueued;
        whatsappSkipped += waResult.recipients.filter((r) => r.status === "skipped").length;
        whatsappFailed += waResult.recipients.filter((r) => r.status === "error").length;
        if (waResult.recipients.length === 0) {
          if (waResult.status === "error") {
            whatsappFailed++;
            errors.push(`WhatsApp: ${waResult.reason || "Unknown WhatsApp failure"}`);
          } else {
            whatsappSkipped++;
          }
        } else if (waResult.status === "error") {
          errors.push(`WhatsApp: ${waResult.reason || "recipient_errors"}`);
        }
      } catch (err) {
        whatsappFailed++;
        errors.push(`WhatsApp: ${err instanceof Error ? err.message : "Unknown WhatsApp failure"}`);
      }

      // Mark event as reminded — gated on reminder_sent_at IS NULL so a
      // concurrent run can't double-flip or clobber an earlier timestamp.
      const { error: flipErr } = await supabase
        .from("events")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", event.id as string)
        .is("reminder_sent_at", null);
      if (flipErr) {
        console.warn(`[Cron:EventReminders] reminder_sent_at update failed for event ${shortId(event.id)}:`, flipErr.message);
      }

      eventsProcessed++;
    }

    if (errors.length > 0) {
      console.warn(`[Cron:EventReminders] ${eventsProcessed} events, ${whatsappQueued} queued, ${whatsappSkipped} skipped, ${whatsappFailed} failed:`, errors.slice(0, 10));
    }

    return NextResponse.json({
      success: true,
      eventsProcessed,
      emailsSent,
      emailsFailed,
      smsSent,
      smsSkipped,
      whatsappQueued,
      whatsappSkipped,
      whatsappFailed,
      ceilingHit,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:EventReminders] Fatal error:", msg);
    return NextResponse.json(
      { success: false, error: msg, eventsProcessed, emailsSent, emailsFailed, smsSent, smsSkipped, whatsappQueued, whatsappSkipped, whatsappFailed, ceilingHit },
      { status: 500 }
    );
  }
}
