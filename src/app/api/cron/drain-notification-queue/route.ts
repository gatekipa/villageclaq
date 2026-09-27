import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderTemplate, type TemplateKey } from "@/lib/communications/template-engine";
import crypto from "crypto";
import { recheckPaymentReminderDelivery } from "@/lib/payment-reminder-delivery-recheck";
import {
  dispatchWhatsAppWithResult,
  type WhatsAppNotificationType,
} from "@/lib/whatsapp-dispatcher";
import { sendEmail, type EmailTemplate } from "@/lib/send-email";
import { sendSmsNotification, type SmsTemplate } from "@/lib/send-sms-notification";
import {
  CUT2_EMAIL_TEMPLATE,
  CUT2_SMS_TEMPLATE,
  type Cut2NotificationType,
} from "@/lib/cut2-channel-matrix";

// CUT2_RAW_META_CONTEXT: this worker remains the only approved boundary for
// provider dispatch after an outbox row has been claimed and revalidated.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VERCEL_TIMEOUT_MS = 60000;
const TIMEOUT_GUARD_MS = 5000; // Leave 5 seconds for cleanup/response
const FOUNDER_DELIVERY_SUPPRESSED = "founder_test_external_delivery_suppressed";

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
        const recipient = typeof payload.recipient === "string" ? payload.recipient : "";
        if (!recipient) throw new Error("EMAIL_RECIPIENT_REQUIRED");
        const emailTemplate = CUT2_EMAIL_TEMPLATE[item.template as Cut2NotificationType] as EmailTemplate | undefined;
        if (!emailTemplate) throw new Error("EMAIL_TEMPLATE_NOT_ALLOWED");
        const result = await sendEmail({ to: recipient, template: emailTemplate, data: payload, locale });
        if (!result.success) throw new Error(result.error || "EMAIL_PROVIDER_DISPATCH_FAILED");
        if (!result.messageId) throw new Error("EMAIL_PROVIDER_MESSAGE_ID_MISSING");
        providerMessageId = result.messageId;
      } else if (item.channel === "whatsapp") {
        const recipient = typeof payload.recipient === "string" ? payload.recipient : "";
        if (!recipient) throw new Error("WHATSAPP_RECIPIENT_REQUIRED");

        const dispatchData = Object.fromEntries(
          Object.entries(payload).map(([key, value]) => [
            key,
            typeof value === "string" ? value : value == null ? "" : String(value),
          ]),
        );
        const previousDrainContext = process.env.CUT2_RAW_META_CONTEXT;
        process.env.CUT2_RAW_META_CONTEXT = "drain";
        try {
          const result = await dispatchWhatsAppWithResult(
            item.template as WhatsAppNotificationType,
            recipient,
            locale,
            dispatchData,
          );
          if (!result.success) {
            throw new Error(result.error || "WHATSAPP_PROVIDER_DISPATCH_FAILED");
          }
          if (!result.messageId) {
            throw new Error("WHATSAPP_PROVIDER_MESSAGE_ID_MISSING");
          }
          providerMessageId = result.messageId;
        } finally {
          if (previousDrainContext === undefined) {
            delete process.env.CUT2_RAW_META_CONTEXT;
          } else {
            process.env.CUT2_RAW_META_CONTEXT = previousDrainContext;
          }
        }
      } else if (item.channel === "sms") {
        const recipient = typeof payload.recipient === "string" ? payload.recipient : "";
        if (!recipient) throw new Error("SMS_RECIPIENT_REQUIRED");
        const smsTemplate = CUT2_SMS_TEMPLATE[item.template as Cut2NotificationType] as SmsTemplate | undefined;
        if (!smsTemplate) throw new Error("SMS_TEMPLATE_NOT_ALLOWED");
        const result = await sendSmsNotification({ to: recipient, template: smsTemplate, data: payload, locale });
        if (!result.sent) throw new Error(result.error || (result.skipped ? "SMS_PROVIDER_SKIPPED" : "SMS_PROVIDER_DISPATCH_FAILED"));
        if (!result.messageId) throw new Error("SMS_PROVIDER_MESSAGE_ID_MISSING");
        providerMessageId = result.messageId;
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
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Founder mode is an intentional terminal delivery decision. Record it
      // as skipped/dead-lettered so it cannot look delivered or consume the
      // provider retry budget. Provider failures continue through the normal
      // failed -> retry -> dead-letter settlement path below.
      if (errorMsg === FOUNDER_DELIVERY_SUPPRESSED) {
        const { error: skipError } = await supabase.rpc("skip_notification_delivery", {
          p_command: {
            notification_id: item.id,
            worker_id: workerId,
            reason: errorMsg,
          },
        });
        if (!skipError) {
          skipped++;
          continue;
        }
        console.warn(`[DrainQueue] Settle suppression failed for ${item.id}:`, skipError.message);
      }

      // Actual provider or contract failure: retain bounded retry behavior.
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
