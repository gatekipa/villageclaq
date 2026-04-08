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

  if (!apiKey) {
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
    const response = await at.SMS.send(smsPayload);
    // Log the AT response for debugging delivery issues
    const msgData = (response as Record<string, unknown>)?.SMSMessageData as Record<string, unknown> | undefined;
    const recipients = (msgData?.Recipients as Array<Record<string, unknown>>) || [];
    const firstStatus = recipients[0]?.statusCode as number | undefined;
    if (firstStatus && firstStatus !== 101) {
      const statusMsg = (recipients[0]?.status as string) || "Unknown status";
      console.warn(`[SMS] AT returned status ${firstStatus} for ${to}: ${statusMsg}`);
    }
    return { sent: true, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown SMS error";
    console.error(`[SMS] Failed to send to ${to}:`, msg);
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
