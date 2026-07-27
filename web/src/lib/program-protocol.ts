/**
 * Browser-facing stream protocol for /api/programs/suggest. Unlike chat
 * (a plain-text token stream with a trailing SOURCES_MARKER frame bolted
 * on), this is a new surface, so it speaks NDJSON end to end: the gateway
 * relays the orchestrator's events (dropping internal ones like `metrics`)
 * and the client parses one JSON object per line.
 *
 * Client-safe: imported by browser components and API routes alike.
 */
import type { Suggestion } from "@/lib/program";

export type ProgramStreamEvent =
  | { type: "assessment"; text: string }
  | { type: "suggestion"; suggestion: Suggestion }
  | { type: "error"; message: string }
  | { type: "done" };

const KNOWN_TYPES = new Set(["assessment", "suggestion", "error", "done"]);

/**
 * Parse an NDJSON body into typed events. Buffers partial lines across
 * chunks (a JSON object can be split mid-line by the network). Unknown
 * event types are skipped, not errors — same forward-compatibility rule
 * the gateway applies to the orchestrator, one hop later.
 */
export async function* parseProgramStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ProgramStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        const event = parseLine(line);
        if (event) yield event;
      }
    }
    // Final line may arrive without a trailing newline.
    const event = parseLine(buffer.trim());
    if (event) yield event;
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): ProgramStreamEvent | null {
  if (!line) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && KNOWN_TYPES.has(parsed.type)) {
      return parsed as ProgramStreamEvent;
    }
  } catch {
    // Malformed line — the orchestrator already validated its side; a bad
    // line here is a transport hiccup, not something the UI can act on.
  }
  return null;
}
