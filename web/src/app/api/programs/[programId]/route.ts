import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/supabase/server";
import { programSaveSchema } from "@/lib/schemas";
import { deleteProgram, updateProgram } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const programIdSchema = z.uuid();

/** Update a saved program (explicit Save in the editor). Free, like create. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ programId: string }> },
) {
  const { supabase, claims } = await getAuth();
  if (!claims) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { programId } = await params;
  const parsedId = programIdSchema.safeParse(programId);
  if (!parsedId.success) {
    return NextResponse.json(
      { success: false, message: "Invalid program id" },
      { status: 400 },
    );
  }

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

  // RLS + user_id filter: users can only ever update their own programs.
  const { data, error } = await updateProgram(
    supabase,
    parsedId.data,
    claims.sub,
    parsed.data.title,
    parsed.data.program,
  );
  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Program not found" },
      { status: 404 },
    );
  }

  logger.info("[api/programs] Program updated", {
    userId: claims.sub,
    programId: parsedId.data,
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ programId: string }> },
) {
  const { supabase, claims } = await getAuth();
  if (!claims) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { programId } = await params;
  const parsedId = programIdSchema.safeParse(programId);
  if (!parsedId.success) {
    return NextResponse.json(
      { success: false, message: "Invalid program id" },
      { status: 400 },
    );
  }

  const { data, error } = await deleteProgram(supabase, parsedId.data, claims.sub);
  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Program not found" },
      { status: 404 },
    );
  }

  logger.info("[api/programs] Program deleted", {
    userId: claims.sub,
    programId: parsedId.data,
  });
  return NextResponse.json({ success: true });
}
