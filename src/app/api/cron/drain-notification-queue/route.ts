import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderCut2TrustedRow } from "@/lib/cut2-drain-render";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

interface ProcessResult {
  success: boolean;
  error?: string;
  providerMessageId?: string;
  providerStatus?: string;
}

function isCut2DbNotReadyError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  const code = String(err.code || "");
  return (
    msg.includes("cut2_provenance_version") ||
    msg.includes("column") && msg.includes("does not exist") ||
    code === "42703" ||
    code === "PGRST204"
  );
}

/**
 * GET /api/cron/drain-notification-queue
 * After Cut 2: ONLY status=queued AND cut2_provenance_version=1.
 * NULL provenance is never selected, rendered, sent, updated, or upgraded.
 * Pre-00115: cut2_db_not_ready, processed=sent=failed=0, no provider calls.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: pending, error: fetchError } = await supabase
    .from("notifications_queue")
    .select("id,user_id,channel,template,data,status,attempts,cut2_provenance_version")
    .eq("status", "queued")
    .eq("cut2_provenance_version", 1)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    if (isCut2DbNotReadyError(fetchError)) {
      return NextResponse.json({
        cut2_db_not_ready: true,
        processed: 0,
        sent: 0,
        failed: 0,
      });
    }
    console.error("[DrainQueue] Failed to fetch pending items:", fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    const { count: remaining } = await supabase
      .from("notifications_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .eq("cut2_provenance_version", 1);
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, remaining: remaining || 0 });
  }

  const previousMetaContext = process.env.CUT2_RAW_META_CONTEXT;
  process.env.CUT2_RAW_META_CONTEXT = "drain";

  let sent = 0;
  let failed = 0;

  try {
    for (const item of pending) {
      if (item.cut2_provenance_version !== 1 || item.status !== "queued") {
        continue;
      }
      const data = (item.data as Record<string, unknown>) || {};
      const attempts = (item.attempts as number) || 0;
      let result: ProcessResult = { success: false };
      let errorMsg = "";

      try {
        const rendered = await renderCut2TrustedRow(supabase, {
          channel: item.channel as string,
          template: item.template as string,
          data,
          cut2_provenance_version: item.cut2_provenance_version as number,
        });
        if (!rendered.ok) {
          errorMsg = rendered.error;
        } else if (rendered.channel === "sms") {
          result = { success: await processSms(rendered.to, rendered.message) };
        } else if (rendered.channel === "email") {
          result = { success: await processEmail(rendered.to, rendered.template, rendered.data, data) };
        } else if (rendered.channel === "whatsapp") {
          result = await processWhatsApp(rendered.to, rendered.type, rendered.data);
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : "Unknown error";
      }

      if (!errorMsg && result.error) errorMsg = result.error;

      if (result.success) {
        const sentPayload = {
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
          data: result.providerMessageId
            ? {
                ...data,
                providerMessageId: result.providerMessageId,
                providerStatus: result.providerStatus || "accepted",
              }
            : data,
        };

        const { data: sentRows, error: sentUpdateError } = await supabase
          .from("notifications_queue")
          .update(sentPayload)
          .eq("id", item.id)
          .eq("cut2_provenance_version", 1)
          .select("id");

        if (sentUpdateError || !sentRows || sentRows.length === 0) {
          const persistenceError = sentUpdateError?.message || "No queue row was updated";
          const failureMessage = `Provider accepted message but queue sent status was not persisted: ${persistenceError}`;
          console.warn("[DrainQueue] Failed to persist sent queue item:", {
            id: item.id,
            error: persistenceError,
          });

          await supabase
            .from("notifications_queue")
            .update({
              status: "failed",
              attempts: attempts + 1,
              error_message: failureMessage,
            })
            .eq("id", item.id)
            .eq("cut2_provenance_version", 1);

          failed++;
          continue;
        }

        sent++;
      } else {
        const newAttempts = attempts + 1;
        if (newAttempts >= MAX_RETRIES) {
          await supabase
            .from("notifications_queue")
            .update({
              status: "failed",
              attempts: newAttempts,
              error_message: errorMsg || "Max retries exceeded",
            })
            .eq("id", item.id)
            .eq("cut2_provenance_version", 1);
          failed++;
        } else {
          await supabase
            .from("notifications_queue")
            .update({
              attempts: newAttempts,
              error_message: errorMsg || "Send failed, will retry",
            })
            .eq("id", item.id)
            .eq("cut2_provenance_version", 1);
        }
      }
    }
  } finally {
    if (previousMetaContext === undefined) {
      delete process.env.CUT2_RAW_META_CONTEXT;
    } else {
      process.env.CUT2_RAW_META_CONTEXT = previousMetaContext;
    }
  }

  const { count: remaining } = await supabase
    .from("notifications_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .eq("cut2_provenance_version", 1);

  return NextResponse.json({
    processed: pending.length,
    sent,
    failed,
    remaining: remaining || 0,
  });
}

async function processSms(recipient: string, message: string): Promise<boolean> {
  if (!recipient || !message) return false;
  const { isAfricanPhoneNumber } = await import("@/lib/is-african-phone");
  if (!isAfricanPhoneNumber(recipient)) {
    console.log(`[DrainQueue:SMS] Skipping non-African number: ${recipient.slice(0, 6)}***`);
    return true;
  }
  const { sendSMS } = await import("@/lib/notifications/sms-sender");
  const result = await sendSMS({ to: recipient, message });
  return result.sent;
}

async function processEmail(
  recipient: string,
  template: string,
  emailData: Record<string, string>,
  _envelope: Record<string, unknown>,
): Promise<boolean> {
  if (!recipient) return false;
  const locale = emailData.locale === "fr" ? "fr" : "en";
  const { sendEmail } = await import("@/lib/send-email");
  const result = await sendEmail({
    to: recipient,
    template: template as Parameters<typeof sendEmail>[0]["template"],
    data: emailData,
    locale,
  });
  return result.success;
}

async function processWhatsApp(
  recipient: string,
  waType: string,
  waData: Record<string, string>,
): Promise<ProcessResult> {
  if (!recipient) return { success: false, error: "Missing recipient" };
  const locale = waData.locale === "fr" ? "fr" : "en";
  const { dispatchWhatsAppWithResult } = await import("@/lib/whatsapp-dispatcher");
  const result = await dispatchWhatsAppWithResult(
    waType as Parameters<typeof dispatchWhatsAppWithResult>[0],
    recipient,
    locale,
    waData,
  );
  return {
    success: result.success,
    error: result.error,
    providerMessageId: result.messageId,
    providerStatus: result.success ? "accepted" : undefined,
  };
}
