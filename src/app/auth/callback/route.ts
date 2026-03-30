import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Validate that a redirect path is safe (relative, no protocol, no double-slash).
 * Prevents open-redirect attacks via the `next` query parameter.
 */
function safePath(raw: string): string {
  // Must start with "/" and must NOT start with "//" (protocol-relative)
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  // Strip any embedded protocol (e.g., "/http://evil.com")
  try {
    const url = new URL(raw, "http://localhost");
    if (url.hostname !== "localhost") return "/dashboard";
  } catch {
    return "/dashboard";
  }
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next") ?? "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // After successful auth, check if user has pending invitations.
      // This handles the case where ?redirectTo was lost during email
      // confirmation flow — we detect invitations server-side and redirect
      // to my-invitations instead of letting the DashboardGuard send them
      // to group onboarding.
      if (next === "/dashboard") {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.email) {
            // Check if user has any memberships first
            const { count: membershipCount } = await supabase
              .from("memberships")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id);

            // Only check invitations if user has no memberships
            // (existing members should go to their dashboard)
            if (!membershipCount || membershipCount === 0) {
              const { count: inviteCount } = await supabase
                .from("invitations")
                .select("id", { count: "exact", head: true })
                .eq("email", user.email)
                .eq("status", "pending");

              if (inviteCount && inviteCount > 0) {
                return NextResponse.redirect(`${origin}/dashboard/my-invitations`);
              }
            }
          }
        } catch {
          // Non-critical — fall through to default redirect
        }
      }

      // Redirect to the intended destination (intl middleware will add locale prefix)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to login with an error indicator
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
