import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getMonthlyRequestCount } from "@/lib/db";

export const FREE_MONTHLY_LIMIT = 15;

/**
 * Free-tier quota gate: allows up to FREE_MONTHLY_LIMIT requests per
 * calendar month. Billing/subscriptions were intentionally dropped from
 * this port — reintroduce plan checks here when Stripe comes back.
 */
export async function checkQuota(
  dbClient: SupabaseClient<Database>,
  userId: string
): Promise<{ allowed: boolean; status: number; message: string }> {
  const { count, error } = await getMonthlyRequestCount(dbClient, userId);

  if (error) {
    return {
      allowed: false,
      status: 500,
      message: "Failed to check your monthly usage. Please try again.",
    };
  }

  if (count >= FREE_MONTHLY_LIMIT) {
    return {
      allowed: false,
      status: 403,
      message: `You have reached the monthly request limit (${FREE_MONTHLY_LIMIT}).`,
    };
  }

  return { allowed: true, status: 200, message: "OK" };
}
