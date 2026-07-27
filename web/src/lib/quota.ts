import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getMonthlyAiActions, getMonthlyRequestCount } from "@/lib/db";

export const FREE_MONTHLY_LIMIT = 15;
export const AI_ACTIONS_MONTHLY_LIMIT = 10;

/**
 * Free-tier quota gate: allows up to FREE_MONTHLY_LIMIT requests per
 * calendar month.
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

/**
 * Program-feature AI quota: every AI call (normalize a paste, get
 * suggestions) costs one action from a separate monthly pool. Manual
 * editing and saving are free — only LLM calls are metered. Charged on
 * success only: the gateway records usage after the orchestrator responds,
 * so rejected pastes and failures don't burn credits.
 */
export async function checkAiActionsQuota(
  dbClient: SupabaseClient<Database>,
  userId: string
): Promise<{ allowed: boolean; status: number; message: string }> {
  const { count, error } = await getMonthlyAiActions(dbClient, userId);

  if (error) {
    return {
      allowed: false,
      status: 500,
      message: "Failed to check your monthly AI usage. Please try again.",
    };
  }

  if (count >= AI_ACTIONS_MONTHLY_LIMIT) {
    return {
      allowed: false,
      status: 403,
      message: `You have used all ${AI_ACTIONS_MONTHLY_LIMIT} AI actions for this month.`,
    };
  }

  return { allowed: true, status: 200, message: "OK" };
}
