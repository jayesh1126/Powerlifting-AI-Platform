import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/chat", "/settings", "/api/chat", "/api/chats", "/api/account"];

// Reject oversized API request bodies before any parsing happens (parity
// with the old app's body-size middleware). The chat schema caps messages
// at 2000 chars anyway — anything near this limit is not a real request.
const MAX_API_BODY_BYTES = 50_000;

/**
 * Proxy (Next 16 rename of middleware): refreshes the Supabase session on
 * every matched request and redirects unauthenticated users away from
 * protected routes. API routes get a 401 instead of a redirect. Route
 * handlers still re-verify auth themselves — this is the outer gate, not
 * the only one.
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
    const contentLength = request.headers.get("content-length");
    if (hasBody && !contentLength) {
      // Chunked bodies would bypass the size check below; no legitimate
      // client of this API streams request bodies.
      return NextResponse.json(
        { success: false, message: "Content-Length required" },
        { status: 411 }
      );
    }
    if (Number(contentLength ?? 0) > MAX_API_BODY_BYTES) {
      return NextResponse.json(
        { success: false, message: "Request body too large" },
        { status: 413 }
      );
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: true,
              sameSite: "lax",
              path: "/",
            })
          );
        },
      },
    }
  );

  // Verified locally (no network round-trip with asymmetric JWTs).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (!claims && isProtected) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
