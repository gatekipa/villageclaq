import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateClaimToken } from "@/lib/proxy-claim";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { dispatchWhatsApp } from "@/lib/whatsapp-dispatcher";
import { isAfricanPhoneNumber } from "@/lib/is-african-phone";
import { isValidWhatsAppNumber } from "@/lib/format-phone-whatsapp";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { membershipId, email, phone, channels, locale } = body as {
      membershipId: string;
      email?: string;
      phone?: string;
      channels: string[];
      locale?: string;
    };

    if (!membershipId || !channels || channels.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Email or phone is required" },
        { status: 400 }
      );
    }

    // Verify membership exists and is a proxy member
    const { data: membership, error: memberErr } = await supabase
      .from("memberships")
      .select("id, display_name, user_id, is_proxy, group_id, groups(name)")
      .eq("id", membershipId)
      .single();

    if (memberErr || !membership) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 }
      );
    }

    if (membership.user_id !== null) {
      return NextResponse.json(
        { error: "Member already has an account" },
        { status: 400 }
      );
    }

    if (!membership.is_proxy) {
      return NextResponse.json(
        { error: "Member is not a proxy member" },
        { status: 400 }
      );
    }

    // Verify caller is admin/owner of this group
    const { data: callerMembership } = await supabase
      .from("memberships")
      .select("role")
      .eq("group_id", membership.group_id)
      .eq("user_id", user.id)
      .single();

    if (
      !callerMembership ||
      !["owner", "admin"].includes(callerMembership.role)
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Generate claim token
    const { claimUrl, expiresAt } = await generateClaimToken(
      membershipId,
      email || null,
      phone || null,
      user.id
    );

    const groups = membership.groups as unknown as Record<string, unknown> | null;
    const groupName = (groups?.name as string) || "";
    const memberName = membership.display_name || "";
    const sendLocale = (locale as "en" | "fr") || "en";

    // Send notifications via requested channels
    const results: Record<string, { sent: boolean; error?: string }> = {};

    if (channels.includes("email") && email) {
      const emailResult = await sendEmail({
        to: email,
        template: "proxy-claim",
        data: {
          memberName,
          groupName,
          claimUrl,
          expiresAt: expiresAt.toISOString(),
        },
        locale: sendLocale,
      });
      results.email = {
        sent: emailResult.success,
        error: emailResult.error,
      };
    }

    if (channels.includes("sms") && phone) {
      if (isAfricanPhoneNumber(phone)) {
        const smsResult = await sendSmsNotification({
          to: phone,
          template: "proxy-claim",
          data: { memberName, groupName, claimUrl },
          locale: sendLocale,
        });
        results.sms = { sent: smsResult.sent, error: smsResult.error };
      } else {
        results.sms = {
          sent: false,
          error: "SMS only available for African phone numbers",
        };
      }
    }

    if (channels.includes("whatsapp") && phone) {
      if (isValidWhatsAppNumber(phone)) {
        const waResult = await dispatchWhatsApp(
          "proxy_claim",
          phone,
          sendLocale,
          { memberName, groupName, claimUrl }
        );
        results.whatsapp = { sent: waResult };
      } else {
        results.whatsapp = { sent: false, error: "Phone not WhatsApp eligible" };
      }
    }

    return NextResponse.json({
      success: true,
      claimUrl,
      expiresAt: expiresAt.toISOString(),
      results,
    });
  } catch (err) {
    console.error("[ProxyClaim:Send] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
