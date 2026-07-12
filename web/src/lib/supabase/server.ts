import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Server client bound to the request cookies — used in server components,
 * route handlers and server actions. Uses the publishable key so RLS applies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
              })
            );
          } catch {
            // Called from a Server Component — safe to ignore because the
            // middleware refreshes sessions and writes cookies there.
          }
        },
      },
    }
  );
}

/**
 * Returns the RLS-scoped client plus locally-verified JWT claims for the
 * current user, or null claims when not authenticated.
 *
 * Wrapped in React cache(): layouts, pages and route handlers can all
 * call getAuth() freely — within one request it verifies exactly once.
 */
export const getAuth = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    // Expected for anonymous visitors (no session cookie) — keep quiet.
    logger.debug("[Auth] No verifiable session", { err: error.message });
    return { supabase, claims: null };
  }
  return { supabase, claims: data?.claims ?? null };
});
