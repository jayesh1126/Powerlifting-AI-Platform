import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { deleteChat } from "@/lib/db";

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
  // RLS + user_id filter means users can only ever delete their own chats.
  const { data, error } = await deleteChat(supabase, chatId, claims.sub);
  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Chat not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
