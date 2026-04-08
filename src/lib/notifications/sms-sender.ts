import { createClient } from "@/lib/supabase/server";

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

  console.log("[SMS DIAG] sendSMS called", {
    to,
    messageLength: message.length,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "MISSING",
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

    console.log("[SMS DIAG] Calling Africa's Talking SDK", { to, senderId: senderId || "(default shortcode)", username });
    const response = await at.SMS.send(smsPayload);
    console.log("[SMS DIAG] Africa's Talking raw response:", JSON.stringify(response));

    // Log the AT response for debugging delivery issues
    const msgData = (response as Record<string, unknown>)?.SMSMessageData as Record<string, unknown> | undefined;
    const recipients = (msgData?.Recipients as Array<Record<string, unknown>>) || [];
    const firstStatus = recipients[0]?.statusCode as number | undefined;
    if (firstStatus && firstStatus !== 101) {
      const statusMsg = (recipients[0]?.status as string) || "Unknown status";
      console.warn(`[SMS DIAG] AT returned non-success status ${firstStatus} for ${to}: ${statusMsg}`);
    } else {
      console.log("[SMS DIAG] AT success — status 101 (sent to carrier)", { to });
    }
    return { sent: true, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown SMS error";
    console.error(`[SMS DIAG] Africa's Talking SDK EXCEPTION for ${to}:`, msg);
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
  } catch {
    // Queue failure is non-fatal
  }
}
