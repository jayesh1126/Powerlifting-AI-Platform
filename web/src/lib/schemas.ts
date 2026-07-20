import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(2000, "Message is too long (max 2000 characters)")
    .refine((v) => !/[<>{}]/.test(v), "Message contains invalid characters"),
  chatId: z.uuid().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
