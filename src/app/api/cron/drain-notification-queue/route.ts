import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lookupMemberLocale, type Locale } from "@/lib/cron-notify-helper";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Resolve the locale for a queued payload.
 *
 * Precedence:
 *   1. Explicit `data.locale` — the enqueuer already made a decision.
 *   2. `member_locale(data.user_id)` — only when locale is absent.
 *   3. "en" fallback — keeps the channel working when neither exists.
 *
 * SMS payloads rendered at enqueue time (`data.message`) cannot be
 * re-localized — drain cannot know the original template or values.
 * This helper is for channels that still accept a locale parameter.
 */
async function resolveLocale(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<Locale> {
  const explicit = data.locale;
  if (explicit === "en" || explicit === "fr") return explicit;
  const userId = typeof data.user_id === "string" ? data.user_id : null;
  if (userId) {
    return await lookupMemberLocale(supabase, userId);
  }
  return "en";
}

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

/**
 * GET /api/cron/drain-notification-queue
 * Vercel Cron — runs every 15 minutes.
 * Processes pending messages in notifications_queue (SMS, email, WhatsApp).
 * Oldest first (FIFO). Max 50 per run to avoid timeout.
 * Retries up to 3 times, then marks as failed.
 */
export async function GET(request: Request) {
  // ── Auth: verify CRON_SECRET ──
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── Fetch pending items (oldest first, limit 50) ──
  const { data: pending, error: fetchError } = await supabase
    .from("notifications_queue")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    console.error("[DrainQueue] Failed to fetch pending items:", fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, remaining: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    const channel = item.channel as string;
    const data = item.data as Record<string, unknown>;
    const recipient = (data.recipient as string) || "";
    const attempts = (item.attempts as number) || 0;

    let success = false;
    let errorMsg = "";

    try {
      switch (channel) {
        case "sms": {
          // SMS payload is pre-rendered at enqueue time (see
          // notifications/sms-sender.ts) — no locale re-resolution.
          success = await processSms(recipient, data);
          break;
        }
        case "email": {
          const locale = await resolveLocale(supabase, data);
          success = await processEmail(recipient, data, locale);
          break;
        }
        case "whatsapp": {
          const locale = await resolveLocale(supabase, data);
          success = await processWhatsApp(recipient, data, locale);
          break;
        }
        default: {
          errorMsg = `Unknown channel: ${channel}`;
          break;
        }
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Unknown error";
    }

    if (success) {
      // Mark as sent
      await supabase
        .from("notifications_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", item.id);
      sent++;
    } else {
      const newAttempts = attempts + 1;
      if (newAttempts >= MAX_RETRIES) {
        // Max retries exceeded — mark as failed
        await supabase
          .from("notifications_queue")
          .update({
            status: "failed",
            attempts: newAttempts,
            error_message: errorMsg || "Max retries exceeded",
          })
          .eq("id", item.id);
        failed++;
      } else {
        // Increment attempts, leave as queued for next run
        await supabase
          .from("notifications_queue")
          .update({
            attempts: newAttempts,
            error_message: errorMsg || "Send failed, will retry",
          })
          .eq("id", item.id);
      }
    }
  }

  // Count remaining pending items
  const { count: remaining } = await supabase
    .from("notifications_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  return NextResponse.json({
    processed: pending.length,
    sent,
    failed,
    remaining: remaining || 0,
  });
}

// ─── Channel Processors ──────────────────────────────────────────────────────

async function processSms(recipient: string, data: Record<string, unknown>): Promise<boolean> {
  if (!recipient) return false;

  // CRITICAL: Enforce African-only SMS — queued items must still pass the country check.
  // Without this, non-African numbers queued on SDK failure would burn AT API credits.
  const { isAfricanPhoneNumber } = await import("@/lib/is-african-phone");
  if (!isAfricanPhoneNumber(recipient)) {
    console.log(`[DrainQueue:SMS] Skipping non-African number: ${recipient.slice(0, 6)}***`);
    return true; // Return true to mark as "sent" so it doesn't retry forever
  }

  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!apiKey) return false; // AT still not configured — leave for next run

  const username = process.env.AFRICASTALKING_USERNAME || "villageclaq";
  const message = (data.message as string) || "";
  if (!message) return false;

  const AfricasTalking = (await import("africastalking")).default;
  const at = AfricasTalking({ apiKey, username });
  const senderId = process.env.AFRICASTALKING_SENDER_ID;
  const smsPayload: { to: string[]; message: string; from?: string } = { to: [recipient], message };
  if (senderId) smsPayload.from = senderId;
  await at.SMS.send(smsPayload);
  return true;
}

async function processEmail(
  recipient: string,
  data: Record<string, unknown>,
  locale: Locale,
): Promise<boolean> {
  if (!recipient) return false;

  const { sendEmail } = await import("@/lib/send-email");
  const template = (data.template as string) || "notification";

  const result = await sendEmail({
    to: recipient,
    template: template as Parameters<typeof sendEmail>[0]["template"],
    data: (data.emailData as Record<string, unknown>) || data,
    locale,
  });
  return result.success;
}

async function processWhatsApp(
  recipient: string,
  data: Record<string, unknown>,
  locale: Locale,
): Promise<boolean> {
  if (!recipient) return false;

  const waType = data.whatsappType as string | undefined;
  const waData = (data.whatsappData as Record<string, string>) || {};

  if (waType) {
    // Typed dispatch
    const { dispatchWhatsApp } = await import("@/lib/whatsapp-dispatcher");
    return await dispatchWhatsApp(
      waType as Parameters<typeof dispatchWhatsApp>[0],
      recipient,
      locale,
      waData,
    );
  }

  // Direct template
  const template = data.template as string | undefined;
  if (template) {
    const { sendWhatsAppMessage } = await import("@/lib/send-whatsapp");
    const result = await sendWhatsAppMessage({
      to: recipient,
      template,
      language: locale,
      components: (data.components as Parameters<typeof sendWhatsAppMessage>[0]["components"]) || undefined,
    });
    return result.success;
  }

  return false;
}
