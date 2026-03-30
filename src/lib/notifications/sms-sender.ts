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
    await at.SMS.send({ to: [to], message, from: "VillageClaq" });
    return { sent: true, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown SMS error";
    console.warn(`[SMS] Failed to send to ${to}:`, msg);
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
