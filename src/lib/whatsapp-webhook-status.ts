import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppProviderStatus = "sent" | "delivered" | "read" | "failed" | string;

export interface WhatsAppStatusEvent {
  providerMessageId: string;
  status: WhatsAppProviderStatus;
  recipientPhoneMask?: string;
  metaTimestamp?: string;
  rawEvent: Record<string, unknown>;
  errorCode?: string;
  errorTitle?: string;
  errorMessage?: string;
}

export interface WebhookChallengeResult {
  ok: boolean;
  challenge?: string;
  status: number;
}

interface MetaStatusError {
  code?: string | number;
  title?: string;
  message?: string;
  error_data?: {
    details?: string;
  };
}

interface MetaStatusObject {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: MetaStatusError[];
  [key: string]: unknown;
}

interface MetaWebhookChange {
  field?: string;
  value?: {
    metadata?: Record<string, unknown>;
    statuses?: MetaStatusObject[];
    [key: string]: unknown;
  };
}

interface MetaWebhookEntry {
  changes?: MetaWebhookChange[];
}

interface MetaWebhookPayload {
  entry?: MetaWebhookEntry[];
}

const PHONE_KEY_PATTERN = /(^recipient_id$|phone|wa_id|^from$|^to$)/i;
const EMBEDDED_PHONE_EXEMPT_KEY_PATTERN = /(^id$|message_id|provider_message_id|^status$|^timestamp$|template|language|locale|^code$|^type$)/i;
const PHONE_LIKE_SUBSTRING_PATTERN = /(?<![A-Za-z0-9])\+?(?:\d[\s().-]?){6,14}\d(?![A-Za-z0-9])/g;

export function verifyWhatsAppWebhookChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): WebhookChallengeResult {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (!verifyToken || mode !== "subscribe" || !challenge) {
    return { ok: false, status: 403 };
  }

  if (token !== verifyToken) {
    return { ok: false, status: 403 };
  }

  return { ok: true, challenge, status: 200 };
}

export function extractWhatsAppStatusEvents(payload: unknown): WhatsAppStatusEvent[] {
  const events: WhatsAppStatusEvent[] = [];
  const entries = (payload as MetaWebhookPayload | null)?.entry;

  if (!Array.isArray(entries)) return events;

  for (const entry of entries) {
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const statuses = change.value?.statuses;
      if (!Array.isArray(statuses)) continue;

      for (const statusObject of statuses) {
        const providerMessageId = typeof statusObject.id === "string" ? statusObject.id : "";
        const status = typeof statusObject.status === "string" ? statusObject.status : "";
        if (!providerMessageId || !status) continue;

        const firstError = Array.isArray(statusObject.errors) ? statusObject.errors[0] : undefined;
        events.push({
          providerMessageId,
          status,
          recipientPhoneMask: maskPhoneValue(statusObject.recipient_id),
          metaTimestamp: metaTimestampToIso(statusObject.timestamp),
          rawEvent: sanitizeWebhookEvent({
            ...statusObject,
            metadata: change.value?.metadata || {},
          }),
          errorCode: firstError?.code === undefined ? undefined : String(firstError.code),
          errorTitle: sanitizeWebhookText(firstError?.title),
          errorMessage: sanitizeWebhookText(firstError?.error_data?.details || firstError?.message || firstError?.title),
        });
      }
    }
  }

  return events;
}

export async function persistWhatsAppStatusEvent(
  supabase: SupabaseClient,
  event: WhatsAppStatusEvent,
): Promise<{ inserted: boolean; queueRowsUpdated: number }> {
  const { error: insertError } = await supabase
    .from("whatsapp_message_status_events")
    .insert({
      provider_message_id: event.providerMessageId,
      status: event.status,
      recipient_phone_mask: event.recipientPhoneMask || null,
      meta_timestamp: event.metaTimestamp || null,
      raw_event: sanitizeWebhookEvent(event.rawEvent),
      error_code: event.errorCode || null,
      error_title: sanitizeWebhookText(event.errorTitle) || null,
      error_message: sanitizeWebhookText(event.errorMessage) || null,
    });

  if (insertError) {
    throw new Error(`Failed to insert WhatsApp status event: ${insertError.message}`);
  }

  const { data: queueRows, error: queueLookupError } = await supabase
    .from("notifications_queue")
    .select("id,data")
    .eq("channel", "whatsapp")
    .contains("data", { providerMessageId: event.providerMessageId });

  if (queueLookupError) {
    throw new Error(`Failed to find notification queue row: ${queueLookupError.message}`);
  }

  let queueRowsUpdated = 0;
  for (const row of (queueRows || []) as Array<{ id: string; data: Record<string, unknown> | null }>) {
    const nextData = buildQueueDataPatch(row.data || {}, event);
    const { error: updateError } = await supabase
      .from("notifications_queue")
      .update({ data: nextData })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Failed to update notification queue row: ${updateError.message}`);
    }
    queueRowsUpdated++;
  }

  return { inserted: true, queueRowsUpdated };
}

export function buildQueueDataPatch(
  existingData: Record<string, unknown>,
  event: WhatsAppStatusEvent,
): Record<string, unknown> {
  const nextData: Record<string, unknown> = {
    ...existingData,
    latestProviderStatus: event.status,
    latestProviderStatusAt: event.metaTimestamp || new Date().toISOString(),
  };

  if (event.errorCode) nextData.providerErrorCode = event.errorCode;
  if (event.errorMessage) nextData.providerErrorMessage = sanitizeWebhookText(event.errorMessage);

  return nextData;
}

export function sanitizeWebhookEvent(value: unknown, key = ""): Record<string, unknown> {
  return sanitizeValue(value, key) as Record<string, unknown>;
}

function sanitizeValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[childKey] = sanitizeValue(childValue, childKey);
    }
    return sanitized;
  }

  if (typeof value === "string") {
    if (PHONE_KEY_PATTERN.test(key)) {
      return maskPhoneValue(value) || value;
    }
    if (EMBEDDED_PHONE_EXEMPT_KEY_PATTERN.test(key)) {
      return value;
    }
    return maskPhoneLikeSubstrings(value);
  }

  return value;
}

function sanitizeWebhookText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return maskPhoneLikeSubstrings(value);
}

function maskPhoneLikeSubstrings(value: string): string {
  return value.replace(PHONE_LIKE_SUBSTRING_PATTERN, (candidate) => maskPhoneCandidate(candidate));
}

function maskPhoneCandidate(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return value;
  if (looksLikeDate(value)) return value;
  const prefix = value.trimStart().startsWith("+") ? "+" : "";
  return `${prefix}${maskDigits(digits)}`;
}

function looksLikeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function maskPhoneValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  return maskDigits(digits);
}

function maskDigits(digits: string): string {
  if (digits.length <= 6) return "***";
  return `${digits.slice(0, 3)}******${digits.slice(-3)}`;
}

function metaTimestampToIso(timestamp: unknown): string | undefined {
  if (typeof timestamp !== "string" || !timestamp) return undefined;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}
