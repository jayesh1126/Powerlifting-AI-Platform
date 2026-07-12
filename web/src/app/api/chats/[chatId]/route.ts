import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/supabase/server";
import { deleteChat } from "@/lib/db";
import { logger } from "@/lib/logger";

const chatIdSchema = z.string().uuid();

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { supabase, claims } = await getAuth();
  if (!claims) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const { chatId } = await params;
  const parsed = chatIdSchema.safeParse(chatId);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid chat id" },
      { status: 400 }
    );
  }

  // RLS + user_id filter means users can only ever delete their own chats.
  const { data, error } = await deleteChat(supabase, parsed.data, claims.sub);
  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Chat not found" },
      { status: 404 }
    );
  }

  logger.info("[api/chats] Chat deleted", {
    userId: claims.sub,
    chatId: parsed.data,
  });
  return NextResponse.json({ success: true });
}
