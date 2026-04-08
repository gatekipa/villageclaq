import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSmsNotification, type SmsTemplate } from "@/lib/send-sms-notification";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/sms/send
 * Send a template-based SMS notification.
 * Auth: Bearer token (user JWT) — validates caller is authenticated.
 *
 * Body: { to: string (phone in E.164), template: SmsTemplate, data: Record, locale?: "en"|"fr" }
 * If "to" is a user UUID, resolves phone from profiles table.
 */
export async function POST(request: Request) {
  try {
    // Verify caller is authenticated
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[SMS DIAG] /api/sms/send — no auth header, returning 401");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log("[SMS DIAG] /api/sms/send — invalid token, returning 401", authError?.message);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { to, template, data, locale } = body;
    console.log("[SMS DIAG] /api/sms/send — received request", { to, template, locale, dataKeys: Object.keys(data || {}) });

    if (!to || !template) {
      console.log("[SMS DIAG] /api/sms/send — missing required fields", { to: !!to, template: !!template });
      return NextResponse.json(
        { error: "Missing required fields: to, template" },
        { status: 400 }
      );
    }

    // If "to" is a UUID, resolve phone from profiles
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let recipientPhone: string = to;

    if (UUID_REGEX.test(to)) {
      console.log("[SMS DIAG] /api/sms/send — 'to' is UUID, resolving phone from profiles", { userId: to });
      if (!supabaseServiceKey) {
        console.log("[SMS DIAG] /api/sms/send — SUPABASE_SERVICE_ROLE_KEY not configured, returning 500");
        return NextResponse.json(
          { success: false, error: "Service role key not configured" },
          { status: 500 }
        );
      }

      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: profile, error: profileErr } = await serviceClient
        .from("profiles")
        .select("phone")
        .eq("id", to)
        .single();

      if (profileErr || !profile?.phone) {
        console.log("[SMS DIAG] /api/sms/send — no phone found for UUID", { userId: to, error: profileErr?.message, phone: profile?.phone });
        return NextResponse.json(
          { success: false, error: `No phone number found for user ${to}` },
          { status: 400 }
        );
      }

      recipientPhone = profile.phone;
      console.log("[SMS DIAG] /api/sms/send — resolved phone from UUID", { phone: recipientPhone });
    } else {
      console.log("[SMS DIAG] /api/sms/send — 'to' is phone number directly", { phone: recipientPhone });
    }

    console.log("[SMS DIAG] /api/sms/send — calling sendSmsNotification", { to: recipientPhone, template, locale: locale || "en" });
    const result = await sendSmsNotification({
      to: recipientPhone,
      template: template as SmsTemplate,
      data: data || {},
      locale: locale || "en",
    });

    console.log("[SMS DIAG] /api/sms/send — sendSmsNotification result", result);

    if (result.sent) {
      return NextResponse.json({ success: true });
    } else if (result.skipped) {
      return NextResponse.json({ success: false, skipped: true, reason: result.error });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[SMS DIAG] /api/sms/send — uncaught error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
