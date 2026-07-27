import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import {
  programNormalizeRequestSchema,
  MAX_DAYS_PER_WEEK,
  MAX_PROGRAM_WEEKS,
} from "@/lib/schemas";
import { checkAiActionsQuota } from "@/lib/quota";
import { recordAiUsage } from "@/lib/db";
import { normalizeProgram, OrchestratorError } from "@/lib/orchestrator";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Reject an oversized body before parsing it. The paste itself is capped at
 * 12k chars (schema + UI), so a legitimate body is ~13k; 50k is generous
 * headroom that still stops a pathological megabyte-sized body from being
 * JSON-parsed just to be rejected.
 */
const MAX_BODY_CHARS = 50_000;

/**
 * Paste -> canonical Program JSON. Gateway only: auth, validate, quota,
 * proxy, charge. Quota semantics: one AI action is charged whenever the model
 * actually ran — a successful program, a rejection ("that's a recipe"), and a
 * "too large" result all cost one action, because the LLM call happened either
 * way (free rejections would let anyone drain AI spend by pasting garbage).
 * Only pre-call failures (auth, validation, quota) and system errors are free.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  // Auth outside the try: the catch below needs supabase/userId in scope
  // to charge usage on "too large" failures.
  const { supabase, claims } = await getAuth();
  if (!claims) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }
  const userId = claims.sub;

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { success: false, message: "Request is too large" },
        { status: 413 },
      );
    }
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* invalid JSON falls through to the schema failure below */
    }
    const parsed = programNormalizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 },
      );
    }
    logger.info("[api/programs] Normalize request", {
      requestId,
      userId,
      chars: parsed.data.programText.length,
    });

    const quota = await checkAiActionsQuota(supabase, userId);
    if (!quota.allowed) {
      logger.warn("[api/programs] Blocked by AI quota", {
        userId,
        status: quota.status,
      });
      return NextResponse.json(
        { success: false, message: quota.message },
        { status: quota.status },
      );
    }

    const result = await normalizeProgram(
      { user_id: userId, program_text: parsed.data.programText },
      { requestId },
    );

    // Charge as soon as the model has done the work — rejections included.
    // Free rejections would let anyone drain AI spend by pasting garbage;
    // the LLM call costs the same either way. A failed ledger insert is
    // logged but must not eat the result the LLM already produced.
    const { error: usageError } = await recordAiUsage(
      supabase,
      userId,
      "program_normalize",
    );
    if (usageError) {
      logger.error("[api/programs] Failed to record AI usage", {
        requestId,
        userId,
      });
    }

    if (!result.isProgram) {
      // The system worked; the input wasn't a program. 200 with a flag —
      // an expected UI state, not an error.
      return NextResponse.json({
        success: true,
        isProgram: false,
        reason: result.reason,
      });
    }

    if (result.program.weeks.length > MAX_PROGRAM_WEEKS) {
      return NextResponse.json(
        {
          success: false,
          message: `Programs are limited to ${MAX_PROGRAM_WEEKS} weeks — this one has ${result.program.weeks.length}.`,
        },
        { status: 422 },
      );
    }
    if (result.program.weeks.some((w) => w.days.length > MAX_DAYS_PER_WEEK)) {
      return NextResponse.json(
        {
          success: false,
          message: `A week is limited to ${MAX_DAYS_PER_WEEK} training days.`,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      isProgram: true,
      program: result.program,
    });
  } catch (err) {
    if (err instanceof OrchestratorError && err.status === 422) {
      // "Too large": the model generated to its ceiling — the most
      // expensive call of all — so it charges like any completed call.
      const { error: usageError } = await recordAiUsage(
        supabase,
        userId,
        "program_normalize",
      );
      if (usageError) {
        logger.error("[api/programs] Failed to record AI usage", { requestId });
      }
      return NextResponse.json(
        { success: false, message: err.message },
        { status: 422 },
      );
    }
    logger.error("[api/programs] Normalize failed", { requestId, err });
    return NextResponse.json(
      {
        success: false,
        message: "We couldn't process this program. Please try again.",
      },
      { status: 500 },
    );
  }
}
