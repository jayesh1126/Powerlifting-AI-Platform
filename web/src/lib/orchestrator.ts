import "server-only";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ChatRole } from "@/lib/types";
import { programSchema, type Program } from "@/lib/program";
import type { ProgramStreamEvent } from "@/lib/program-protocol";

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

// ---------------------------------------------------------------------------
// Programs (contract mirror: orchestrator/app/models.py — change together)
// ---------------------------------------------------------------------------

/** A typed failure so routes can map specific orchestrator statuses (e.g.
 * 422 "program too large") to user-facing responses instead of a generic 500. */
export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Normalize is one LLM call plus one repair retry — a long multi-week
 * program can legitimately run 60-90s per attempt. */
const PROGRAM_NORMALIZE_TIMEOUT_MS = 180_000;
/** Suggest = retrieval + one streamed LLM call. */
const PROGRAM_SUGGEST_TIMEOUT_MS = 180_000;

export type NormalizeResult =
  | { isProgram: true; program: Program }
  | { isProgram: false; reason: string | null };

/**
 * Pasted text -> canonical Program, or a rejection ("that's a recipe").
 * Plain JSON, not a stream. The response's program is re-parsed through the
 * contract schema: this is the one seam where the Python and TS mirrors
 * meet, so drift should explode here with a clear log line, not surface as
 * undefined fields deep in the editor.
 */
export async function normalizeProgram(
  payload: { user_id: string; program_text: string },
  opts: { requestId: string },
): Promise<NormalizeResult> {
  const res = await fetch(`${serverEnv.orchestratorUrl}/v1/programs/normalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Api-Key": serverEnv.orchestratorApiKey,
      "X-Request-Id": opts.requestId,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PROGRAM_NORMALIZE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `Orchestrator normalize failed (${res.status})`;
    try {
      const parsed = JSON.parse(detail);
      if (typeof parsed?.detail === "string") message = parsed.detail;
    } catch {
      /* non-JSON body — keep the generic message */
    }
    throw new OrchestratorError(message, res.status);
  }

  const data = (await res.json()) as {
    is_program: boolean;
    reason: string | null;
    program: unknown;
  };
  if (!data.is_program) {
    return { isProgram: false, reason: data.reason ?? null };
  }
  return { isProgram: true, program: programSchema.parse(data.program) };
}

export interface ProgramSuggestStream {
  /** Sanitized NDJSON (program-protocol events) — pipe straight to the browser. */
  events: ReadableStream<Uint8Array>;
  /** Resolves on clean end; rejects on runtime error (then: don't charge quota). */
  completion: Promise<{ suggestionCount: number }>;
}

/**
 * Program + optional instruction -> relayed NDJSON suggestion stream.
 * Sanitization: `assessment`/`suggestion` pass through untouched, `metrics`
 * is logged and dropped (internal), `end` becomes the browser's `done`, and
 * a runtime `error` is forwarded as an error EVENT (data, not a broken
 * stream) so the client shows calm copy. Unknown types are dropped —
 * the browser vocabulary is exactly program-protocol.ts.
 */
export async function streamProgramSuggestions(
  payload: { user_id: string; program: Program; instruction: string | null },
  opts: { requestId: string },
): Promise<ProgramSuggestStream> {
  const res = await fetch(`${serverEnv.orchestratorUrl}/v1/programs/suggest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Api-Key": serverEnv.orchestratorApiKey,
      "X-Request-Id": opts.requestId,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PROGRAM_SUGGEST_TIMEOUT_MS),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Orchestrator suggest failed (${res.status}): ${detail.slice(0, 500)}`,
    );
  }

  const body = res.body;
  const encoder = new TextEncoder();
  let resolveCompletion!: (v: { suggestionCount: number }) => void;
  let rejectCompletion!: (e: Error) => void;
  const completion = new Promise<{ suggestionCount: number }>(
    (resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    },
  );
  completion.catch(() => {}); // route attaches its own catch; avoid unhandled noise

  let suggestionCount = 0;

  const events = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let runtimeError: Error | null = null;

      const emit = (event: ProgramStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: { type?: string; [key: string]: unknown };
        try {
          event = JSON.parse(line);
        } catch {
          logger.warn("[Orchestrator] Unparseable suggest line", {
            line: line.slice(0, 200),
          });
          return;
        }
        switch (event.type) {
          case "assessment":
          case "suggestion":
            if (event.type === "suggestion") suggestionCount += 1;
            controller.enqueue(encoder.encode(line + "\n"));
            break;
          case "metrics":
            logger.info("[Orchestrator] Suggest metrics", {
              metrics: event.data,
            });
            break;
          case "error":
            runtimeError = new Error(
              (event.message as string) ?? "Orchestrator reported an error",
            );
            emit({ type: "error", message: runtimeError.message });
            break;
          case "end":
            emit({ type: "done" });
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
        if (runtimeError) rejectCompletion(runtimeError);
        else resolveCompletion({ suggestionCount });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("[Orchestrator] Suggest stream errored", {
          err: error.message,
        });
        controller.error(error);
        rejectCompletion(error);
      }
    },
  });

  return { events, completion };
}
