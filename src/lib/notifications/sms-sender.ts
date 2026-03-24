import { createClient } from "@/lib/supabase/server";

interface SendSMSParams {
  to: string;
  message: string;
}

/**
 * Send SMS via Africa's Talking API.
 * If AT_API_KEY is not configured, queues the SMS in notifications_queue.
 */
export async function sendSMS({ to, message }: SendSMSParams): Promise<{ sent: boolean; queued: boolean }> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  if (!apiKey || !username) {
    await queueNotification("sms", to, { message });
    return { sent: false, queued: true };
  }

  try {
    const AfricasTalking = (await import("africastalking")).default;
    const at = AfricasTalking({ apiKey, username });
    await at.SMS.send({ to: [to], message, from: "VillageClaq" });
    return { sent: true, queued: false };
  } catch {
    await queueNotification("sms", to, { message });
    return { sent: false, queued: true };
  }
}

async function queueNotification(channel: string, recipient: string, data: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.from("notifications_queue").insert({
    channel,
    template: "generic",
    data: { recipient, ...data },
    status: "queued",
  });
}
