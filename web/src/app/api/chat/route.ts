import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/schemas";
import { checkQuota } from "@/lib/quota";
import {
  createChat,
  createMessages,
  deleteChat,
  getChatOwner,
  getMessagesForChat,
  updateChatSummary,
} from "@/lib/db";
import { decryptString } from "@/lib/encryption";
import {
  Citation,
  streamChatCompletion,
  type OrchestratorCompletion,
  type Subscription,
} from "@/lib/orchestrator";
import { logger } from "@/lib/logger";
import type { ChatRole } from "@/lib/types";
import { Json } from "@/lib/database.types";
import { SOURCES_MARKER } from "@/lib/chat-protocol";

export const runtime = "nodejs";

/**
 * How many recent messages we ship to the AI runtime. Deliberately
 * generous: the runtime's context builder decides how much of the window
 * each subscription tier actually uses. We just avoid shipping entire
 * 300-message conversations over the wire.
 */
const MESSAGE_WINDOW = 30;

/** Billing was dropped from this port; everyone is free-tier for now. */
const SUBSCRIPTION: Subscription = "free";

/**
 * Chat gateway. This route deliberately does NO AI work:
 *   1. authenticate (Supabase JWT from cookies)
 *   2. validate input
 *   3. authorize (quota + chat ownership)
 *   4. load conversation context from the DB (never trusted from the client)
 *   5. proxy to the Python AI runtime, forwarding its token stream
 *   6. persist messages + the runtime's refreshed summary in the background
 *
 * The runtime decides everything AI: which tools run, how much context is
 * used, when the summary refreshes. We just pass what we know (recent
 * messages, summary, counts, subscription) and store what comes back.
 */
export async function POST(request: NextRequest) {
  // Correlates gateway and orchestrator logs for this request.
  const requestId = crypto.randomUUID();
  try {
    // --- 1. Authenticate ---
    const { supabase, claims } = await getAuth();
    if (!claims) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
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
        { status: 400 },
      );
    }
    const { message, chatId } = parsed.data;
    logger.info("[api/chat] Incoming request", {
      requestId,
      userId,
      chatId: chatId ?? "new",
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
        { status: quota.status },
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
          { status: 404 },
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

    // --- 5. Load conversation context server-side ---
    const { data: history } = chatId
      ? await getMessagesForChat(supabase, userId, targetChatId)
      : { data: [] };
    const totalMessageCount = history?.length ?? 0;
    const recentMessages = (history ?? [])
      .slice(-MESSAGE_WINDOW)
      .map((m) => ({ role: m.role as ChatRole, content: m.content }));

    // --- 6. Stream from the AI runtime ---
    let stream;
    try {
      stream = await streamChatCompletion(
        {
          user_id: userId,
          chat_id: targetChatId,
          messages: [...recentMessages, { role: "User", content: message }],
          summary,
          total_message_count: totalMessageCount,
          user_context: { subscription: SUBSCRIPTION },
          request_context: {
            locale:
              request.headers.get("accept-language")?.split(",")[0] ??
              undefined,
          },
        },
        { requestId },
      );
    } catch (err) {
      // Don't leave an empty chat in the sidebar when the runtime was
      // never reached.
      if (!chatId) void deleteChat(supabase, targetChatId, userId);
      throw err;
    }
    const { textStream, completion } = stream;

    void persistConversation({
      completion,
      supabase,
      userId,
      chatId: targetChatId,
      userMessage: message,
      requestId,
    });

    // Pipe answer tokens unchanged, then append the sources frame once the
    // runtime's citations resolve — so the browser shows sources live.
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = textStream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          const { citations } = await completion;
          const sources = dedupeSources(citations);
          if (sources.length) {
            controller.enqueue(
              encoder.encode(SOURCES_MARKER + JSON.stringify(sources)),
            );
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      },
    });

    return new Response(responseBody, { headers: responseHeaders });
  } catch (err) {
    logger.error("[api/chat] Request failed", { requestId, err });
    return NextResponse.json(
      {
        success: false,
        message:
          "An unexpected error occurred while generating your response. Please try again.",
      },
      { status: 500 },
    );
  }
}

/** Collapse retrieved chunks to distinct sources (by URL), display fields only.
 * Shared by persistence and the live sources frame so both stay identical. */
function dedupeSources(citations: Citation[]) {
  return Array.from(
    new Map(
      citations
        .filter((c) => c.sourceUrl)
        .map((c) => [
          c.sourceUrl,
          { title: c.title, author: c.author, sourceUrl: c.sourceUrl },
        ]),
    ).values(),
  );
}

/**
 * Waits for the runtime stream to finish, then persists both messages and
 * (when the runtime refreshed it) the rolling summary. If the stream
 * errored, nothing is persisted — a partial answer the user never fully
 * received should not become conversation history.
 */
async function persistConversation({
  completion,
  supabase,
  userId,
  chatId,
  userMessage,
  requestId,
}: {
  completion: Promise<OrchestratorCompletion>;
  supabase: Awaited<ReturnType<typeof getAuth>>["supabase"];
  userId: string;
  chatId: string;
  userMessage: string;
  requestId: string;
}) {
  try {
    const { fullText, summary, citations } = await completion;

    if (!fullText.trim()) {
      logger.warn("[api/chat] Empty assistant response — nothing persisted", {
        requestId,
        userId,
        chatId,
      });
      return;
    }

    // One answer often retrieves several chunks from the same source — show
    // each source once. Strip to display fields; chunk ids aren't useful here
    // and go stale on re-ingest.
    const sources = dedupeSources(citations);

    const { error } = await createMessages(supabase, [
      { chat_id: chatId, content: userMessage, role: "User", user_id: userId },
      {
        chat_id: chatId,
        content: fullText,
        role: "Assistant",
        user_id: userId,
        citations: sources.length ? (sources as unknown as Json) : null,
      },
    ]);

    if (error) throw new Error("Failed to insert messages");

    if (summary) {
      await updateChatSummary(supabase, chatId, userId, summary);
    }
    logger.info("[api/chat] Conversation persisted", {
      requestId,
      userId,
      chatId,
      summaryUpdated: Boolean(summary),
    });
  } catch (err) {
    logger.error("[api/chat] Post-stream persistence failed", {
      requestId,
      err,
      userId,
      chatId,
    });
  }
}
