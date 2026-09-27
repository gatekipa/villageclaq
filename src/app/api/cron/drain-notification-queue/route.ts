import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderTemplate, type TemplateKey } from "@/lib/communications/template-engine";
import crypto from "crypto";
import { recheckPaymentReminderDelivery } from "@/lib/payment-reminder-delivery-recheck";

// CUT2_RAW_META_CONTEXT: this worker remains the only approved boundary for
// provider dispatch after an outbox row has been claimed and revalidated.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VERCEL_TIMEOUT_MS = 60000;
const TIMEOUT_GUARD_MS = 5000; // Leave 5 seconds for cleanup/response

export async function GET(request: Request) {
  const startTime = Date.now();
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const workerId = 'worker_' + crypto.randomUUID();

  // 1. Claim batch
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_notification_batch", {
    p_command: { batch_size: 25, worker_id: workerId },
  });

  if (claimErr) {
    console.error("[DrainQueue] Failed to claim batch:", claimErr.message);
    return NextResponse.json({ success: false, error: claimErr.message }, { status: 500 });
  }

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, worker_id: workerId });
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of claimed) {
    // Timeout Guard: if remaining execution time < 5 seconds, exit cleanly
    if (Date.now() - startTime > VERCEL_TIMEOUT_MS - TIMEOUT_GUARD_MS) {
      console.warn(`[DrainQueue] Timeout guard triggered for worker ${workerId}. Exiting loop cleanly.`);
      break;
    }

    try {
      const templateKey = item.template as TemplateKey;
      const payload = (item.data as Record<string, unknown>) || {};
      const locale = payload.locale === 'fr' ? 'fr' : 'en';

      // Payment reminders are demands, so the queued snapshot is never enough.
      // Recheck current membership, policy, due date, waiver and confirmed
      // balance immediately before any provider dispatch.
      if (item.template === "payment_reminder") {
        const recheck = await recheckPaymentReminderDelivery(supabase, item as Record<string, unknown>);
        if (!recheck.eligible) {
          const { error: skipError } = await supabase.rpc("skip_notification_delivery", {
            p_command: {
              notification_id: item.id,
              worker_id: workerId,
              reason: recheck.reason,
            },
          });
          if (skipError) throw skipError;
          skipped++;
          continue;
        }
      }

      const rendered = renderTemplate(templateKey, locale, payload);
      let providerMessageId = "";
      
      // Dispatch via channel
      if (item.channel === "email") {
        // Mock email dispatch
        console.log(`[DrainQueue] Sending Email to ${payload.recipient || "unknown"}`);
        providerMessageId = `mock_email_${crypto.randomUUID()}`;
      } else if (item.channel === "sms" || item.channel === "whatsapp") {
        // Mock SMS/WA dispatch
        console.log(`[DrainQueue] Sending ${item.channel} to ${payload.recipient || "unknown"}`);
        providerMessageId = `mock_${item.channel}_${crypto.randomUUID()}`;
      } else if (item.channel === "in_app") {
        // Insert into notifications
        const { error: insErr } = await supabase.from("notifications").insert({
          group_id: item.group_id,
          user_id: payload.user_id, // ensure user_id is in payload for in-app or fetched
          type: templateKey,
          title: rendered.subject,
          body: rendered.text,
          data: payload
        });
        if (insErr) throw insErr;
        providerMessageId = `in_app_${crypto.randomUUID()}`;
      } else {
        throw new Error(`Unsupported channel: ${item.channel}`);
      }

      // Settle success
      const { error: settleErr } = await supabase.rpc("settle_notification_delivery", {
        p_command: {
          notification_id: item.id,
          worker_id: workerId,
          success: true,
          provider_message_id: providerMessageId,
          error_message: null,
        },
      });

      if (settleErr) {
        console.warn(`[DrainQueue] Settle success failed for ${item.id}:`, settleErr.message);
      } else {
        succeeded++;
      }
    } catch (err) {
      // Settle failure
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[DrainQueue] Item ${item.id} failed:`, errorMsg);
      
      const { error: settleErr } = await supabase.rpc("settle_notification_delivery", {
        p_command: {
          notification_id: item.id,
          worker_id: workerId,
          success: false,
          provider_message_id: null,
          error_message: errorMsg,
        },
      });

      if (settleErr) {
        console.warn(`[DrainQueue] Settle error failed for ${item.id}:`, settleErr.message);
      }
      failed++;
    }
  }

  return NextResponse.json({
    processed: succeeded + failed + skipped,
    succeeded,
    failed,
    skipped,
    worker_id: workerId
  });
}
