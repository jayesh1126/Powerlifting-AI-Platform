import "server-only";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ChatMode, ChatRole } from "@/lib/types";

/**
 * Client for the Python orchestrator service. The Next.js API layer owns
 * authentication/authorization; the orchestrator trusts requests carrying
 * the shared internal API key and does the heavy lifting (RAG, agents,
 * LLM streaming).
 */

export interface OrchestratorChatPayload {
  user_id: string;
  chat_id: string;
  message: string;
  mode: ChatMode;
  summary: string | null;
  last_messages: { role: ChatRole; content: string }[];
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Internal-Api-Key": serverEnv.orchestratorApiKey,
  };
}

/** Streams the LLM response as raw UTF-8 text chunks. */
export async function streamChatCompletion(
  payload: OrchestratorChatPayload
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${serverEnv.orchestratorUrl}/v1/chat/stream`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Orchestrator stream failed (${res.status}): ${detail.slice(0, 500)}`
    );
  }

  return res.body;
}

/** Asks the orchestrator to produce an updated rolling chat summary. */
export async function summarizeChat(input: {
  existing_summary: string | null;
  messages: { role: ChatRole; content: string }[];
}): Promise<string | null> {
  try {
    const res = await fetch(`${serverEnv.orchestratorUrl}/v1/summarize`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      logger.error("[Orchestrator] summarize failed", { status: res.status });
      return null;
    }

    const data = (await res.json()) as { summary: string };
    return data.summary ?? null;
  } catch (err) {
    logger.error("[Orchestrator] summarize request errored", { err });
    return null;
  }
}
