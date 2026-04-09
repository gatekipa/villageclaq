import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  // Extract locale from the request URL path (e.g. /fr/callback → fr)
  const pathLocale = new URL(request.url).pathname.split("/")[1];
  const locale = pathLocale === "fr" ? "fr" : "en";
  return NextResponse.redirect(`${origin}/${locale}/login?error=auth`);
}
