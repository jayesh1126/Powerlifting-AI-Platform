/**
 * Delimiter for the trailing citations frame appended to the chat token
 * stream, so the browser can render sources on the live turn (not only after
 * a reload). Server writes all answer tokens, then this marker, then the
 * sources JSON; the client splits on it. 0x1E is the ASCII record separator —
 * it won't occur in answer text.
 */
export const SOURCES_MARKER = "\n\x1e__SOURCES__\x1e";
