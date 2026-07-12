import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/schemas";
import { checkQuota } from "@/lib/quota";
import {
  countMessagesForChat,
  createChat,
  createMessages,
  getChatOwner,
  getMessagesForChat,
  updateChatSummary,
} from "@/lib/db";
import { decryptString } from "@/lib/encryption";
import { streamChatCompletion, summarizeChat } from "@/lib/orchestrator";
import { logger } from "@/lib/logger";
import type { ChatRole } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Chat gateway. This route deliberately does NO AI work:
 *   1. authenticate (Supabase JWT from cookies)
 *   2. validate input
 *   3. authorize (quota + chat ownership)
 *   4. load conversation context from the DB (never trusted from the client)
 *   5. proxy to the Python orchestrator and stream its response back
 *   6. persist messages + refresh the rolling summary in the background
 */
export async function POST(request: NextRequest) {
  try {
    // --- 1. Authenticate ---
    const { supabase, claims } = await getAuth();
    if (!claims) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = claims.sub;

    // --- 2. Validate input ---
    const body = await request.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 }
      );
    }
    const { message, chatId, mode } = parsed.data;
    logger.info("[api/chat] Incoming request", {
      userId,
      chatId: chatId ?? "new",
      mode,
    });

    // --- 3. Quota ---
    const quota = await checkQuota(supabase, userId);
    if (!quota.allowed) {
      logger.warn("[api/chat] Blocked by quota", {
        userId,
        status: quota.status,
      });
      return NextResponse.json(
        { success: false, message: quota.message },
        { status: quota.status }
      );
    }

    // --- 4. Resolve target chat (create new, or verify ownership) ---
    const responseHeaders = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
    });
    let targetChatId: string;
    let summary: string | null = null;

    if (!chatId) {
      const { data: newChat, error } = await createChat(supabase, {
        title: message.split(" ").slice(0, 10).join(" "),
        user_id: userId,
      });
      if (error || !newChat) {
        throw new Error("Failed to create chat");
      }
      targetChatId = newChat.id;
      responseHeaders.set("X-New-Chat-Id", newChat.id);
    } else {
      const { data: chat, error } = await getChatOwner(supabase, chatId);
      if (error || !chat || chat.user_id !== userId) {
        logger.warn("[api/chat] Chat not found or not owned", {
          userId,
          chatId,
        });
        return NextResponse.json(
          { success: false, message: "Chat not found" },
          { status: 404 }
        );
      }
      targetChatId = chatId;
      try {
        summary = chat.summary ? decryptString(chat.summary) : null;
      } catch {
        // Corrupt/legacy summary must not block the chat itself.
        summary = null;
      }
    }

    // --- 5. Load recent context server-side ---
    const { data: history } = chatId
      ? await getMessagesForChat(supabase, userId, targetChatId)
      : { data: [] };
    const lastMessages = (history ?? []).slice(-8).map((m) => ({
      role: m.role as ChatRole,
      content: m.content,
    }));

    // --- 6. Stream from the orchestrator ---
    const stream = await streamChatCompletion({
      user_id: userId,
      chat_id: targetChatId,
      message,
      mode,
      summary,
      last_messages: lastMessages,
    });

    // One copy goes to the client, the other is drained for persistence.
    const [clientStream, persistStream] = stream.tee();

    void persistConversation({
      persistStream,
      supabase,
      userId,
      chatId: targetChatId,
      userMessage: message,
      summary,
      lastMessages,
    });

    return new Response(clientStream, { headers: responseHeaders });
  } catch (err) {
    logger.error("[api/chat] Request failed", { err });
    return NextResponse.json(
      {
        success: false,
        message:
          "An unexpected error occurred while generating your response. Please try again.",
      },
      { status: 500 }
    );
  }
}

/** Drains the teed stream, persists both messages, refreshes summary. */
async function persistConversation({
  persistStream,
  supabase,
  userId,
  chatId,
  userMessage,
  summary,
  lastMessages,
}: {
  persistStream: ReadableStream<Uint8Array>;
  supabase: Awaited<ReturnType<typeof getAuth>>["supabase"];
  userId: string;
  chatId: string;
  userMessage: string;
  summary: string | null;
  lastMessages: { role: ChatRole; content: string }[];
}) {
  try {
    const reader = persistStream.getReader();
    const decoder = new TextDecoder();
    let fullMessage = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      fullMessage += decoder.decode(value, { stream: true });
    }
    fullMessage += decoder.decode();

    if (!fullMessage.trim()) {
      logger.warn("[api/chat] Empty assistant response — nothing persisted", {
        userId,
        chatId,
      });
      return;
    }

    const { error } = await createMessages(supabase, [
      { chat_id: chatId, content: userMessage, role: "User", user_id: userId },
      {
        chat_id: chatId,
        content: fullMessage,
        role: "Assistant",
        user_id: userId,
      },
    ]);
    if (error) throw new Error("Failed to insert messages");
    logger.info("[api/chat] Conversation persisted", { userId, chatId });

    // Refresh the rolling summary early in a chat, then every ~5 exchanges.
    const { count } = await countMessagesForChat(supabase, userId, chatId);
    if (count === 2 || count % 10 === 0) {
      const newSummary = await summarizeChat({
        existing_summary: summary,
        messages: [
          ...lastMessages,
          { role: "User", content: userMessage },
          { role: "Assistant", content: fullMessage },
        ],
      });
      if (newSummary) {
        await updateChatSummary(supabase, chatId, userId, newSummary);
      }
    }
  } catch (err) {
    logger.error("[api/chat] Post-stream persistence failed", {
      err,
      userId,
      chatId,
    });
  }
}
