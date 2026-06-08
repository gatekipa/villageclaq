import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  extractWhatsAppStatusEvents,
  persistWhatsAppStatusEvent,
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp-webhook-status";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const result = verifyWhatsAppWebhookChallenge(
    new URL(request.url).searchParams,
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  );

  if (!result.ok || result.challenge === undefined) {
    console.warn("[WhatsAppWebhook] Verification failed");
    return NextResponse.json({ error: "Forbidden" }, { status: result.status });
  }

  return new Response(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    console.warn("[WhatsAppWebhook] Failed to read request body");
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppWebhookSignature(rawBody, signatureHeader, process.env.WHATSAPP_APP_SECRET)) {
    console.warn("[WhatsAppWebhook] Invalid Meta signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[WhatsAppWebhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = extractWhatsAppStatusEvents(payload);
  if (events.length === 0) {
    return NextResponse.json({ success: true, processed: 0, updated: 0 });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[WhatsAppWebhook] Supabase service config missing");
    return NextResponse.json({ error: "Webhook storage is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let updated = 0;

  try {
    for (const event of events) {
      const result = await persistWhatsAppStatusEvent(supabase, event);
      updated += result.queueRowsUpdated;
    }
  } catch (err) {
    console.warn("[WhatsAppWebhook] Failed to persist status event:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to persist webhook status" }, { status: 500 });
  }

  console.log(`[WhatsAppWebhook] Processed ${events.length} status event(s), updated ${updated} queue row(s)`);
  return NextResponse.json({ success: true, processed: events.length, updated });
}
