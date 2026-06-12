import { createClient } from "@/lib/supabase/server";
import { maskPhoneNumber } from "@/lib/mask-phone";

interface SendSMSParams {
  to: string;
  message: string;
}

/**
 * Send SMS via Africa's Talking API.
 * If AFRICASTALKING_API_KEY is not configured, queues the SMS in notifications_queue.
 * Safe to call fire-and-forget — never throws.
 */
export async function sendSMS({ to, message }: SendSMSParams): Promise<{ sent: boolean; queued: boolean; error?: string }> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME || "villageclaq";

  // Diagnostics never log the raw phone (maskPhoneNumber, repo-wide rule)
  // or any fragment of the API key.
  console.log("[SMS DIAG] sendSMS called", {
    to: maskPhoneNumber(to),
    messageLength: message.length,
    hasApiKey: !!apiKey,
    username,
  });

  if (!apiKey) {
    console.log("[SMS DIAG] AFRICASTALKING_API_KEY not configured — queuing SMS");
    await queueNotification("sms", to, { message });
    return { sent: false, queued: true, error: "AFRICASTALKING_API_KEY not configured" };
  }

  try {
    const AfricasTalking = (await import("africastalking")).default;
    const at = AfricasTalking({ apiKey, username });
    // Only set custom sender ID if registered via AFRICASTALKING_SENDER_ID.
    // Unregistered alphanumeric sender IDs are rejected by carriers.
    // When omitted, Africa's Talking uses a default shared shortcode.
    const senderId = process.env.AFRICASTALKING_SENDER_ID;
    const smsPayload: { to: string[]; message: string; from?: string } = { to: [to], message };
    if (senderId) smsPayload.from = senderId;

    console.log("[SMS DIAG] Calling Africa's Talking SDK", { to: maskPhoneNumber(to), senderId: senderId || "(default shortcode)", username });
    const response = await at.SMS.send(smsPayload);

    // Log a structured AT response summary for debugging delivery issues.
    // Never dump the raw response JSON — its Recipients array echoes the
    // full recipient phone number.
    const msgData = (response as Record<string, unknown>)?.SMSMessageData as Record<string, unknown> | undefined;
    const recipients = (msgData?.Recipients as Array<Record<string, unknown>>) || [];
    console.log("[SMS DIAG] Africa's Talking response", {
      message: (msgData?.Message as string) || null,
      recipients: recipients.map((r) => ({
        number: maskPhoneNumber(r.number as string),
        statusCode: r.statusCode,
        status: r.status,
      })),
    });
    const firstStatus = recipients[0]?.statusCode as number | undefined;
    if (firstStatus && firstStatus !== 101) {
      const statusMsg = (recipients[0]?.status as string) || "Unknown status";
      console.warn(`[SMS DIAG] AT returned non-success status ${firstStatus} for ${maskPhoneNumber(to)}: ${statusMsg}`);
    } else {
      console.log("[SMS DIAG] AT success — status 101 (sent to carrier)", { to: maskPhoneNumber(to) });
    }
    return { sent: true, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown SMS error";
    console.error(`[SMS DIAG] Africa's Talking SDK EXCEPTION for ${maskPhoneNumber(to)}:`, msg);
    await queueNotification("sms", to, { message });
    return { sent: false, queued: true, error: msg };
  }
}

async function queueNotification(channel: string, recipient: string, data: Record<string, unknown>) {
  try {
    const supabase = await createClient();
    await supabase.from("notifications_queue").insert({
      channel,
      template: "generic",
      data: { recipient, ...data },
      status: "queued",
    });
  } catch (err) {
    console.warn("[SMS:Queue] Failed to queue notification:", err instanceof Error ? err.message : err);
  }
}
