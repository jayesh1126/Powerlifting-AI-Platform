import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { programSaveSchema } from "@/lib/schemas";
import { createProgram } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Save a new program. Plain encrypted CRUD — no AI, no quota: only LLM
 * calls are metered, and saving is deliberately free so users never lose
 * work to a spent quota.
 */
export async function POST(request: NextRequest) {
  const { supabase, claims } = await getAuth();
  if (!claims) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }
  const userId = claims.sub;

  const body = await request.json().catch(() => null);
  const parsed = programSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: parsed.error.issues[0]?.message ?? "Invalid request",
      },
      { status: 400 },
    );
  }

  const { data, error } = await createProgram(
    supabase,
    userId,
    parsed.data.title,
    parsed.data.program,
  );
  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Failed to save program" },
      { status: 500 },
    );
  }

  logger.info("[api/programs] Program created", { userId, programId: data.id });
  return NextResponse.json({ success: true, id: data.id });
}
