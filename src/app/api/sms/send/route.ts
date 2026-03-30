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
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { to, template, data, locale } = body;

    if (!to || !template) {
      return NextResponse.json(
        { error: "Missing required fields: to, template" },
        { status: 400 }
      );
    }

    // If "to" is a UUID, resolve phone from profiles
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let recipientPhone: string = to;

    if (UUID_REGEX.test(to)) {
      if (!supabaseServiceKey) {
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
        return NextResponse.json(
          { success: false, error: `No phone number found for user ${to}` },
          { status: 400 }
        );
      }

      recipientPhone = profile.phone;
    }

    const result = await sendSmsNotification({
      to: recipientPhone,
      template: template as SmsTemplate,
      data: data || {},
      locale: locale || "en",
    });

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
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
