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
      // Redirect to the dashboard (intl middleware will add locale prefix)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to login with an error indicator
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
