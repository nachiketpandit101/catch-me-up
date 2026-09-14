import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session on every matched request so that
 * Server Components always see a valid (non-expired) token.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Forward updated cookies to the browser via the response.
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session (don't use getSession — it reads from local storage
  // and can be stale / tampered with).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth");

  // The marketing landing page is reachable without an account.
  const isPublicPage = pathname === "/" || isAuthPage;

  if (!user && !isPublicPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and visiting an auth page, redirect to the library.
  if (user && isAuthPage) {
    const libraryUrl = request.nextUrl.clone();
    libraryUrl.pathname = "/library";
    libraryUrl.search = "";
    return NextResponse.redirect(libraryUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - generated metadata routes (crawlers must reach these without a session)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|opengraph-image|twitter-image|icon|apple-icon|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
