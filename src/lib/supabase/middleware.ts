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

  if (isAuthRoute && user) {
    // Redirect authenticated users away from auth pages.
    // Honor ?redirectTo= so invitation links work for logged-in users.
    const locale = isLocalePrefix ? pathnameLocale : "en";
    const url = request.nextUrl.clone();
    const redirectParam = request.nextUrl.searchParams.get("redirectTo");
    if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
      // Preserve locale prefix if the redirect doesn't already have one
      const hasLocale = redirectParam.startsWith(`/${locale}/`) || redirectParam.startsWith("/en/") || redirectParam.startsWith("/fr/");
      url.pathname = hasLocale ? redirectParam : `/${locale}${redirectParam}`;
    } else {
      url.pathname = `/${locale}/dashboard`;
    }
    url.search = ""; // Clear query params (especially redirectTo) from the destination
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
