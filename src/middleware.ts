import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // First, handle Supabase session refresh and auth redirects
  const supabaseResponse = await updateSession(request);

  // If Supabase middleware issued a redirect, return it
  if (supabaseResponse.headers.get("location")) {
    return supabaseResponse;
  }

  // Then handle i18n routing
  const intlResponse = intlMiddleware(request);

  // Copy Supabase cookies to the intl response
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value);
  });

  return intlResponse;
}

export const config = {
  matcher: [
    // Match all pathnames except static files, API routes, auth callback, and public assets
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|api|auth/callback|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|css|woff|woff2|ttf)$).*)",
  ],
};
