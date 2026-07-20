import "server-only";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ChatRole } from "@/lib/types";

/**
 * Client for the Python orchestrator (the AI runtime). The Next.js layer
 * owns authentication/authorization; the orchestrator trusts requests
 * carrying the shared internal API key and owns everything AI: planning,
 * retrieval, tool calling, generation, summarization.
 *
 * The wire contract mirrors orchestrator/app/models.py — change both
 * together. The response is an NDJSON event stream: `token` events carry
 * answer text; trailing events carry the refreshed summary, citations and
 * metrics. This module parses that stream so the rest of the app only sees
 * (a) a plain text stream for the browser and (b) a completion promise
 * with everything to persist.
 */

export type Subscription = "free" | "pro";

/**
 * Citation used for the LLM's response
 */
export interface Citation {
  id: number | string;
  title: string | null;
  author: string | null;
  sourceUrl: string | null;
}

export interface OrchestratorChatPayload {
  user_id: string;
  chat_id: string;
  /** Recent window, oldest first; the final item is the new user message. */
  messages: { role: ChatRole; content: string }[];
  summary: string | null;
  /** Messages already persisted for this chat (context-length signal). */
  total_message_count: number;
  user_context: { subscription: Subscription };
  request_context: { locale?: string; timezone?: string };
}

interface StreamEvent {
  type: "token" | "citations" | "summary" | "metrics" | "end" | "error";
  text?: string;
  message?: string;
  data?: unknown;
  items?: unknown[];
}

export interface OrchestratorCompletion {
  fullText: string;
  /** Present only on turns where the runtime refreshed the rolling summary. */
  summary: string | null;
  /** Retrieved sources for this answer (deduped downstream). */
  citations: Citation[];
}

export interface OrchestratorStream {
  /** Token text only — safe to pipe straight to the browser. */
  textStream: ReadableStream<Uint8Array>;
  /** Resolves when the stream ends; rejects if the runtime reported an error. */
  completion: Promise<OrchestratorCompletion>;
}

/**
 * Hard cap on one runtime call, covering connection + full generation
 * (multi-round tool use included). Prevents a hung orchestrator from
 * pinning gateway workers indefinitely.
 */
const ORCHESTRATOR_TIMEOUT_MS = 180_000;

export async function streamChatCompletion(
  payload: OrchestratorChatPayload,
  opts: { requestId: string },
): Promise<OrchestratorStream> {
  const res = await fetch(`${serverEnv.orchestratorUrl}/v1/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Api-Key": serverEnv.orchestratorApiKey,
      // Propagated into every orchestrator log line for cross-service
      // correlation.
      "X-Request-Id": opts.requestId,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ORCHESTRATOR_TIMEOUT_MS),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Orchestrator stream failed (${res.status}): ${detail.slice(0, 500)}`,
    );
  }

  return parseEventStream(res.body);
}

/**
 * Splits the runtime's NDJSON event stream into browser text + persistence
 * data. Unknown event types are ignored, so the runtime can add new ones
 * without breaking the gateway.
 */
function parseEventStream(
  body: ReadableStream<Uint8Array>,
): OrchestratorStream {
  const encoder = new TextEncoder();
  let resolveCompletion!: (v: OrchestratorCompletion) => void;
  let rejectCompletion!: (e: Error) => void;
  const completion = new Promise<OrchestratorCompletion>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  // The route always attaches a catch to `completion`; avoid unhandled
  // rejection noise if it errors before that happens.
  completion.catch(() => {});

  let fullText = "";
  let summary: string | null = null;
  let citations: Citation[] = [];

  const textStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: StreamEvent;
        try {
          event = JSON.parse(line) as StreamEvent;
        } catch {
          logger.warn("[Orchestrator] Unparseable stream line", {
            line: line.slice(0, 200),
          });
          return;
        }
        switch (event.type) {
          case "token":
            if (event.text) {
              fullText += event.text;
              controller.enqueue(encoder.encode(event.text));
            }
            break;
          case "summary":
            summary = event.text ?? null;
            break;
          case "metrics":
            logger.info("[Orchestrator] Request metrics", {
              metrics: event.data,
            });
            break;
          case "citations":
            citations = (event.items ?? []).map((raw) => {
              const item = raw as {
                id: number | string;
                metadata?: Record<string, unknown>;
              };
              const meta = item.metadata ?? {};
              return {
                id: item.id,
                title: (meta.title as string) ?? null,
                author: (meta.author as string) ?? null,
                sourceUrl: (meta.source_url as string) ?? null,
              };
            });
            logger.info("[Orchestrator] Citations captured", {
              count: citations.length,
            }); // TODO: TEMP — remove after verifying layer 1
            break;
          case "error":
            throw new Error(event.message ?? "Orchestrator reported an error");
          case "end":
            break;
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) handleLine(line);
        }
        if (buffer.trim()) handleLine(buffer);

        controller.close();
        resolveCompletion({ fullText, summary, citations });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("[Orchestrator] Stream errored", { err: error.message });
        controller.error(error);
        rejectCompletion(error);
      }
    },
  });

  return { textStream, completion };
}
