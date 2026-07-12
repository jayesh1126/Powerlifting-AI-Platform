import type { Database } from "@/lib/database.types";

export type Chat = Pick<
  Database["public"]["Tables"]["chats"]["Row"],
  "id" | "title" | "updated_at" | "summary"
>;

export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type ChatInsert = Database["public"]["Tables"]["chats"]["Insert"];

export type ChatRole = "User" | "Assistant";
