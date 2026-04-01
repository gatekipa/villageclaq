/**
 * WhatsApp Business API sender — mirrors send-email.ts pattern.
 * Uses Meta Cloud API to send template and text messages.
 * NEVER throws — returns { success, error } for safe fire-and-forget usage.
 */

import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "url" | "quick_reply";
  index?: number;
  parameters: Array<{
    type: "text" | "currency" | "date_time" | "image" | "document";
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
    date_time?: { fallback_value: string };
    image?: { link: string };
  }>;
}

export interface WhatsAppMessageParams {
  to: string;
  template: string;
  language: string;
  components?: WhatsAppTemplateComponent[];
}

interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    token: process.env.WHATSAPP_API_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
  };
}

function isConfigured(): boolean {
  const { token, phoneNumberId } = getConfig();
  return !!token && !!phoneNumberId;
}

// ─── Template Message ───────────────────────────────────────────────────────

/**
 * Send a WhatsApp template message via Meta Cloud API.
 * Templates must be pre-approved in Meta Business Manager.
 * Returns { success, messageId, error }.
 */
export async function sendWhatsAppMessage(
  params: WhatsAppMessageParams,
): Promise<WhatsAppResult> {
  try {
    if (!isConfigured()) {
      return { success: false, error: "WhatsApp API not configured" };
    }

    const { token, phoneNumberId, apiVersion } = getConfig();

    const formattedPhone = formatPhoneForWhatsApp(params.to);
    if (!formattedPhone) {
      return { success: false, error: `Invalid phone number: ${params.to}` };
    }

    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: params.template,
        language: {
          code: params.language === "fr" ? "fr" : "en",
        },
        ...(params.components && params.components.length > 0
          ? { components: params.components }
          : {}),
      },
    };

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg =
        (errData as Record<string, unknown>)?.error
          ? ((errData as Record<string, Record<string, string>>).error.message || "Unknown API error")
          : `HTTP ${response.status}`;
      console.warn(`[WhatsApp] Failed to send ${params.template} to ${formattedPhone}:`, errMsg);
      return { success: false, error: errMsg };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const messages = data.messages as Array<Record<string, string>> | undefined;
    const messageId = messages?.[0]?.id;

    return { success: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[WhatsApp] Exception sending ${params.template} to ${params.to}:`, msg);
    return { success: false, error: msg };
  }
}

// ─── Text Message (within 24h window only) ──────────────────────────────────

/**
 * Send a free-form text message. Only works within 24h of a user-initiated
 * conversation (Meta policy). For admin/testing use.
 */
export async function sendWhatsAppText(
  to: string,
  text: string,
): Promise<WhatsAppResult> {
  try {
    if (!isConfigured()) {
      return { success: false, error: "WhatsApp API not configured" };
    }

    const { token, phoneNumberId, apiVersion } = getConfig();

    const formattedPhone = formatPhoneForWhatsApp(to);
    if (!formattedPhone) {
      return { success: false, error: `Invalid phone number: ${to}` };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg =
        (errData as Record<string, unknown>)?.error
          ? ((errData as Record<string, Record<string, string>>).error.message || "Unknown API error")
          : `HTTP ${response.status}`;
      return { success: false, error: errMsg };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const messages = data.messages as Array<Record<string, string>> | undefined;
    return { success: true, messageId: messages?.[0]?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[WhatsApp] Exception sending text to ${to}:`, msg);
    return { success: false, error: msg };
  }
}

// ─── Bulk Send ──────────────────────────────────────────────────────────────

/**
 * Send template message to multiple recipients. Uses Promise.allSettled
 * so individual failures don't block others.
 */
export async function sendBulkWhatsApp(
  recipients: Array<{ to: string; language?: string }>,
  template: string,
  components?: WhatsAppTemplateComponent[],
): Promise<{ sent: number; failed: number }> {
  if (!isConfigured()) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendWhatsAppMessage({
        to: r.to,
        template,
        language: r.language || "en",
        components,
      }),
    ),
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.success) sent++;
    else failed++;
  }

  return { sent, failed };
}
