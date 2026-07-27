import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { AiUsageKind, ChatInsert, MessageInsert } from "@/lib/types";
import { programSchema, type Program } from "@/lib/program";
import { encryptString, decryptString } from "@/lib/encryption";
import { logger } from "@/lib/logger";

type DbClient = SupabaseClient<Database>;

/**
 * Decrypts a value, degrading gracefully instead of failing the whole
 * request — a single corrupt row (or a row written with a different key)
 * shouldn't take down the page.
 */
function safeDecrypt(value: string, fallback: string): string {
  try {
    return decryptString(value);
  } catch (err) {
    logger.error("[DB] Failed to decrypt value", { err: err });
    return fallback;
  }
}

export async function getAllChats(dbClient: DbClient, userId: string) {
  const { data, error } = await dbClient
    .from("chats")
    .select("id, title, updated_at, summary")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("[DB] getAllChats failed", { err: error.message });
    return { data: null, error };
  }

  // Summaries and titles are stored encrypted. Titles written before
  // title encryption landed are plaintext — fall back silently instead of
  // logging an error per legacy row on every sidebar load.
  for (const chat of data) {
    if (chat.summary) chat.summary = safeDecrypt(chat.summary, "");
    if (chat.title) {
      try {
        chat.title = decryptString(chat.title);
      } catch {
        /* legacy plaintext title */
      }
    }
  }

  return { data, error: null };
}

export async function getMessagesForChat(
  dbClient: DbClient,
  userId: string,
  chatId: string
) {
  const { data, error } = await dbClient
    .from("messages")
    .select("*")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .order("role", { ascending: false });

  if (error) {
    logger.error("[DB] getMessagesForChat failed", { err: error.message });
    return { data: null, error };
  }

  for (const msg of data) {
    msg.content = safeDecrypt(msg.content, "[Message could not be decrypted]");
  }

  return { data, error: null };
}

export async function countMessagesForChat(
  dbClient: DbClient,
  userId: string,
  chatId: string
) {
  const { count, error } = await dbClient
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("chat_id", chatId);

  if (error) logger.error("[DB] countMessagesForChat failed", { err: error.message });
  return { count: count ?? 0, error };
}

export async function createChat(dbClient: DbClient, chat: ChatInsert) {
  // The title is derived from the first user message, so it is message
  // content and gets the same encryption-at-rest as messages/summaries.
  const { data, error } = await dbClient
    .from("chats")
    .insert({
      ...chat,
      title: chat.title ? encryptString(chat.title) : chat.title,
    })
    .select("id")
    .single();

  if (error) logger.error("[DB] createChat failed", { err: error.message });
  return { data, error };
}

/** Inserts messages with content encrypted at rest. */
export async function createMessages(
  dbClient: DbClient,
  messages: MessageInsert[]
) {
  const encrypted = messages.map((msg) => ({
    ...msg,
    content: encryptString(msg.content),
  }));

  const { error } = await dbClient.from("messages").insert(encrypted);
  if (error) logger.error("[DB] createMessages failed", { err: error.message });
  return { error };
}

export async function deleteChat(
  dbClient: DbClient,
  chatId: string,
  userId: string
) {
  const { data, error } = await dbClient
    .from("chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) logger.error("[DB] deleteChat failed", { err: error.message });
  return { data, error };
}

/** Returns the chat's owner so callers can verify ownership. */
export async function getChatOwner(dbClient: DbClient, chatId: string) {
  const { data, error } = await dbClient
    .from("chats")
    .select("user_id, summary")
    .eq("id", chatId)
    .single();

  if (error) logger.error("[DB] getChatOwner failed", { err: error.message });
  return { data, error };
}

export async function updateChatSummary(
  dbClient: DbClient,
  chatId: string,
  userId: string,
  newSummary: string
) {
  const { data, error } = await dbClient
    .from("chats")
    .update({ summary: encryptString(newSummary) })
    .eq("id", chatId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) logger.error("[DB] updateChatSummary failed", { err: error.message });
  return { data, error };
}

export async function getMonthlyRequestCount(
  dbClient: DbClient,
  userId: string
) {
  const now = new Date();
  const { data, error } = await dbClient
    .from("request_counts")
    .select("count")
    .eq("user_id", userId)
    .eq("year", now.getFullYear())
    .eq("month", now.getMonth() + 1)
    .maybeSingle();

  if (error) {
    logger.error("[DB] getMonthlyRequestCount failed", { err: error.message });
  }
  return { count: data?.count ?? 0, error };
}

/** Deletes the auth user (cascades to their data via FK/RLS policies). */
export async function deleteUserAccount(adminClient: DbClient, userId: string) {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) logger.error("[DB] deleteUserAccount failed", { err: error.message });
  return { error };
}

// ---------------------------------------------------------------------------
// Programs — user training programs (contract in @/lib/program). The title
// and the program JSON are user training data: encrypted at rest, same as
// chat content. The list query never fetches the JSON — decrypting every
// program to render titles would be pure waste.
// ---------------------------------------------------------------------------

export async function getPrograms(dbClient: DbClient, userId: string) {
  const { data, error } = await dbClient
    .from("programs")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("[DB] getPrograms failed", { err: error.message });
    return { data: null, error };
  }

  for (const program of data) {
    if (program.title) program.title = safeDecrypt(program.title, "[Untitled]");
  }
  return { data, error: null };
}

/**
 * Loads one program, ownership-scoped, and validates the decrypted JSON
 * against the contract schema — a corrupt row or contract drift surfaces
 * here, at the boundary, not deep inside the editor UI.
 */
export async function getProgram(
  dbClient: DbClient,
  userId: string,
  programId: string
) {
  const { data, error } = await dbClient
    .from("programs")
    .select("*")
    .eq("id", programId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error("[DB] getProgram failed", { err: error.message });
    return { data: null, error };
  }
  if (!data) return { data: null, error: null }; // missing or not owned

  let program: Program;
  try {
    program = programSchema.parse(JSON.parse(decryptString(data.program)));
  } catch (err) {
    logger.error("[DB] getProgram could not decode program", { err });
    return { data: null, error: new Error("Program could not be decoded") };
  }

  return {
    data: {
      id: data.id,
      title: data.title ? safeDecrypt(data.title, "") : null,
      program,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
    error: null,
  };
}

export async function createProgram(
  dbClient: DbClient,
  userId: string,
  title: string | null,
  program: Program
) {
  const { data, error } = await dbClient
    .from("programs")
    .insert({
      user_id: userId,
      title: title ? encryptString(title) : null,
      program: encryptString(JSON.stringify(program)),
    })
    .select("id")
    .single();

  if (error) logger.error("[DB] createProgram failed", { err: error.message });
  return { data, error };
}

export async function updateProgram(
  dbClient: DbClient,
  programId: string,
  userId: string,
  title: string | null,
  program: Program
) {
  // updated_at is app-owned: chats get theirs from a DB trigger on message
  // insert, but programs has no trigger — forgetting this would freeze the
  // list ordering.
  const { data, error } = await dbClient
    .from("programs")
    .update({
      title: title ? encryptString(title) : null,
      program: encryptString(JSON.stringify(program)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", programId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) logger.error("[DB] updateProgram failed", { err: error.message });
  return { data, error };
}

export async function deleteProgram(
  dbClient: DbClient,
  programId: string,
  userId: string
) {
  const { data, error } = await dbClient
    .from("programs")
    .delete()
    .eq("id", programId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) logger.error("[DB] deleteProgram failed", { err: error.message });
  return { data, error };
}

// ---------------------------------------------------------------------------
// AI usage ledger — the gateway only inserts the event; the DB trigger owns
// the counter (single-writer invariant, same as chat quota).
// ---------------------------------------------------------------------------

export async function recordAiUsage(
  dbClient: DbClient,
  userId: string,
  kind: AiUsageKind
) {
  const { error } = await dbClient
    .from("ai_usage")
    .insert({ user_id: userId, kind });

  if (error) logger.error("[DB] recordAiUsage failed", { err: error.message });
  return { error };
}

export async function getMonthlyAiActions(dbClient: DbClient, userId: string) {
  const now = new Date();
  const { data, error } = await dbClient
    .from("request_counts")
    .select("ai_actions_count")
    .eq("user_id", userId)
    .eq("year", now.getFullYear())
    .eq("month", now.getMonth() + 1)
    .maybeSingle();

  if (error) {
    logger.error("[DB] getMonthlyAiActions failed", { err: error.message });
  }
  return { count: data?.ai_actions_count ?? 0, error };
}
