import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthRedirect, logRedirectDecision } from "@/lib/auth-redirect";

function safePath(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
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
      // Verify session is established before redirecting — prevents empty dashboard
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await new Promise((r) => setTimeout(r, 500));
      }

      // ── MEMBERSHIP-BASED REDIRECT (single source of truth) ────────────
      // Same logic as /auth/callback — uses getPostAuthRedirect() to ensure
      // 0-membership users are sent to onboarding, not to a stateless dashboard.
      if (next === "/dashboard") {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { count: membershipCount } = await supabase
              .from("memberships")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .neq("membership_status", "exited");

            let inviteCount = 0;
            if (!membershipCount || membershipCount === 0) {
              if (user.email) {
                const { count } = await supabase
                  .from("invitations")
                  .select("id", { count: "exact", head: true })
                  .eq("email", user.email)
                  .eq("status", "pending");
                inviteCount = count ?? 0;
              }
            }

            const destination = getPostAuthRedirect(
              membershipCount ?? 0,
              inviteCount
            );

            logRedirectDecision({
              from: "/[locale]/callback",
              to: destination,
              reason: `membershipCount=${membershipCount ?? 0}, inviteCount=${inviteCount}`,
              membershipsCount: membershipCount ?? 0,
              layer: "callback",
            });

            return NextResponse.redirect(`${origin}${destination}`);
          }
        } catch {
          // Fall through to default redirect — layout guard is the second layer
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  const pathLocale = new URL(request.url).pathname.split("/")[1];
  const locale = pathLocale === "fr" ? "fr" : "en";
  return NextResponse.redirect(`${origin}/${locale}/login?error=auth`);
}
