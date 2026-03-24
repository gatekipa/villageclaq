import { createClient } from "@/lib/supabase/server";

interface SendWhatsAppParams {
  to: string;
  templateName: string;
  parameters: Record<string, string>;
  language?: string;
}

/**
 * Send WhatsApp message via WhatsApp Business API.
 * If credentials are not configured, queues the message in notifications_queue.
 */
export async function sendWhatsApp({ to, templateName, parameters, language = "en" }: SendWhatsAppParams): Promise<{ sent: boolean; queued: boolean }> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    await queueNotification("whatsapp", to, { templateName, parameters, language });
    return { sent: false, queued: true };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: [{
            type: "body",
            parameters: Object.values(parameters).map((value) => ({ type: "text", text: value })),
          }],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    return { sent: true, queued: false };
  } catch {
    await queueNotification("whatsapp", to, { templateName, parameters, language });
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
