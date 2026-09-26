import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session - IMPORTANT: do not remove this
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Extract locale from pathname
  const pathnameLocale = pathname.split("/")[1];
  const isLocalePrefix = ["en", "fr"].includes(pathnameLocale);
  const pathWithoutLocale = isLocalePrefix
    ? pathname.replace(`/${pathnameLocale}`, "")
    : pathname;

  // Protected routes: /dashboard and /admin
  const isProtectedRoute =
    pathWithoutLocale.startsWith("/dashboard") ||
    pathWithoutLocale.startsWith("/admin");
  const isAdminRoute = pathWithoutLocale.startsWith("/admin");
  // Auth routes: login, signup
  const isAuthRoute =
    pathWithoutLocale.startsWith("/login") ||
    pathWithoutLocale.startsWith("/signup");

  if (isProtectedRoute && !user) {
    // Redirect unauthenticated users to login
    const locale = isLocalePrefix ? pathnameLocale : "en";
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Platform-admin gate: /admin/* requires an active platform_staff
  // row. Previously enforced only by the client-side layout guard —
  // the page HTML + Supabase data still flowed to the browser before
  // the client-side redirect fired. Now we block at the edge.
  if (isAdminRoute && user) {
    const { data: staffRow } = await supabase
      .from("platform_staff")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!staffRow) {
      const locale = isLocalePrefix ? pathnameLocale : "en";
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/dashboard`;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthRoute && user) {
    // Redirect authenticated users away from auth pages.
    // Honor ?redirectTo= so invitation links work for logged-in users.
    const locale = isLocalePrefix ? pathnameLocale : "en";
    const url = request.nextUrl.clone();
    const redirectParam = request.nextUrl.searchParams.get("redirectTo");
    let destination: URL | null = null;
    if (redirectParam?.startsWith("/") && !redirectParam.startsWith("//") &&
        !redirectParam.includes("\\")) {
      try {
        const parsed = new URL(redirectParam, request.nextUrl.origin);
        if (parsed.origin === request.nextUrl.origin) destination = parsed;
      } catch { /* Invalid return path falls back to dashboard. */ }
    }
    if (destination) {
      // Parse the path and query separately; assigning `?ref=` to pathname
      // percent-encodes the question mark and breaks referral onboarding.
      const targetPath = destination.pathname;
      const hasLocale = targetPath.startsWith(`/${locale}/`) || targetPath.startsWith("/en/") || targetPath.startsWith("/fr/");
      url.pathname = hasLocale ? targetPath : `/${locale}${targetPath}`;
      url.search = destination.search;
    } else {
      url.pathname = `/${locale}/dashboard`;
      url.search = "";
    }
    url.hash = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
