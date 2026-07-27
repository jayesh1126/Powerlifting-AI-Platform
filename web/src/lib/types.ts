import type { Database } from "@/lib/database.types";

export type Chat = Pick<
  Database["public"]["Tables"]["chats"]["Row"],
  "id" | "title" | "updated_at" | "summary"
>;

export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type ChatInsert = Database["public"]["Tables"]["chats"]["Insert"];

export type ChatRole = "User" | "Assistant";

export type ProgramListItem = Pick<
  Database["public"]["Tables"]["programs"]["Row"],
  "id" | "title" | "updated_at"
>;

// Mirrors the CHECK constraint on ai_usage.kind (the generated types only
// see `string`; the DB enforces the real set).
export type AiUsageKind = "program_normalize" | "program_suggest";
