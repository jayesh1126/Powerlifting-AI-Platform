import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http";
import { logger } from "@/lib/logger";

/**
 * OAuth callback — exchanges the auth code for a session and redirects
 * into the app.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // NOT request.url's origin — that is the container bind address behind
  // the proxy (see publicOrigin).
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Only allow relative redirects to avoid open-redirect abuse.
      const safeNext = next.startsWith("/") ? next : "/chat";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    logger.error("[auth/callback] Code exchange failed", {
      err: error.message,
    });
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
