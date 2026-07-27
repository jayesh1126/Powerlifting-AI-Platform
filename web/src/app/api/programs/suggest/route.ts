import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { programSuggestRequestSchema } from "@/lib/schemas";
import { checkAiActionsQuota } from "@/lib/quota";
import { recordAiUsage } from "@/lib/db";
import { streamProgramSuggestions } from "@/lib/orchestrator";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Guard against oversized bodies before JSON.parse: a 12-week program is
 * ~50-80KB of JSON, so 300KB is generous headroom, not a real ceiling.
 */
const MAX_BODY_CHARS = 300_000;

/**
 * Program + optional instruction -> relayed NDJSON suggestion stream
 * (program-protocol.ts vocabulary). Charged one AI action, on successful
 * completion only — recorded in the background after the stream ends, same
 * pattern as chat's post-stream persistence.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase, claims } = await getAuth();
    if (!claims) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }
    const userId = claims.sub;

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
      /* falls through to schema failure */
    }
    const parsed = programSuggestRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 },
      );
    }
    // Instruction is user content: log presence, never text.
    logger.info("[api/programs] Suggest request", {
      requestId,
      userId,
      weeks: parsed.data.program.weeks.length,
      hasInstruction: Boolean(parsed.data.instruction),
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

    const { events, completion } = await streamProgramSuggestions(
      {
        user_id: userId,
        program: parsed.data.program,
        instruction: parsed.data.instruction ?? null,
      },
      { requestId },
    );

    // Background: charge quota only after the stream completed successfully.
    void (async () => {
      try {
        const { suggestionCount } = await completion;
        const { error } = await recordAiUsage(supabase, userId, "program_suggest");
        if (error) {
          logger.error("[api/programs] Failed to record AI usage", {
            requestId,
            userId,
          });
        }
        logger.info("[api/programs] Suggest completed", {
          requestId,
          userId,
          suggestionCount,
        });
      } catch (err) {
        // Runtime error — the user got an error event, not suggestions.
        // No charge.
        logger.warn("[api/programs] Suggest stream failed — not charged", {
          requestId,
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return new Response(events, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (err) {
    logger.error("[api/programs] Suggest failed", { requestId, err });
    return NextResponse.json(
      {
        success: false,
        message: "We couldn't generate suggestions. Please try again.",
      },
      { status: 500 },
    );
  }
}
