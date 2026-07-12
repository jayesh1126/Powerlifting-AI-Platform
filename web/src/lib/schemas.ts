import { z } from "zod";
import { CHAT_MODES } from "@/lib/types";

export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(2000, "Message is too long (max 2000 characters)")
    .refine((v) => !/[<>{}]/.test(v), "Message contains invalid characters"),
  chatId: z.string().uuid().optional(),
  mode: z.enum(CHAT_MODES).default("general"),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
