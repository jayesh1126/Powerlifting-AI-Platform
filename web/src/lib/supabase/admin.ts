import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Admin client using the secret key — bypasses RLS.
 * Server-only; use exclusively for privileged operations
 * (account deletion, cross-user reads the orchestrator needs).
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseSecretKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
