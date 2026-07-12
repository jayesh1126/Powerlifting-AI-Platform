import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ChatInsert, MessageInsert } from "@/lib/types";
import { encryptString, decryptString } from "@/lib/encryption";

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
    console.error("[DB] Failed to decrypt value:", err);
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
    console.error("[DB] getAllChats failed:", error.message);
    return { data: null, error };
  }

  // Summaries are stored encrypted.
  for (const chat of data) {
    if (chat.summary) chat.summary = safeDecrypt(chat.summary, "");
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
    console.error("[DB] getMessagesForChat failed:", error.message);
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

  if (error) console.error("[DB] countMessagesForChat failed:", error.message);
  return { count: count ?? 0, error };
}

export async function createChat(dbClient: DbClient, chat: ChatInsert) {
  const { data, error } = await dbClient
    .from("chats")
    .insert(chat)
    .select("id")
    .single();

  if (error) console.error("[DB] createChat failed:", error.message);
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
  if (error) console.error("[DB] createMessages failed:", error.message);
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

  if (error) console.error("[DB] deleteChat failed:", error.message);
  return { data, error };
}

/** Returns the chat's owner so callers can verify ownership. */
export async function getChatOwner(dbClient: DbClient, chatId: string) {
  const { data, error } = await dbClient
    .from("chats")
    .select("user_id, summary")
    .eq("id", chatId)
    .single();

  if (error) console.error("[DB] getChatOwner failed:", error.message);
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

  if (error) console.error("[DB] updateChatSummary failed:", error.message);
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
    console.error("[DB] getMonthlyRequestCount failed:", error.message);
  }
  return { count: data?.count ?? 0, error };
}

/** Deletes the auth user (cascades to their data via FK/RLS policies). */
export async function deleteUserAccount(adminClient: DbClient, userId: string) {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) console.error("[DB] deleteUserAccount failed:", error.message);
  return { error };
}
