/**
 * Centralised, typed access to environment variables.
 * Server-only vars must never be imported into client components.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Safe to use anywhere (inlined at build time for the client bundle).
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
};

// Server-only. Accessing these from the browser will throw.
export const serverEnv = {
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get orchestratorUrl() {
    return required("ORCHESTRATOR_URL");
  },
  get orchestratorApiKey() {
    return required("ORCHESTRATOR_API_KEY");
  },
};
