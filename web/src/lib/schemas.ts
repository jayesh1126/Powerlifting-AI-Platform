import { z } from "zod";
import { programSchema } from "@/lib/program";

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

// ---------------------------------------------------------------------------
// Programs. These are POLICY limits (what we accept), layered on top of the
// CONTRACT in @/lib/program (what a Program is) — the contract stays an
// exact mirror of the orchestrator; caps live here. No [<>{}] refine like
// chat: program notes legitimately contain such characters, and React
// escaping + encryption at rest make the filter unnecessary.
// ---------------------------------------------------------------------------

export const MAX_PROGRAM_WEEKS = 12;
export const MAX_DAYS_PER_WEEK = 7;

/** Program with gateway policy applied — used wherever a client submits one. */
const boundedProgramSchema = programSchema
  .refine(
    (p) => p.weeks.length <= MAX_PROGRAM_WEEKS,
    `Programs are limited to ${MAX_PROGRAM_WEEKS} weeks`
  )
  .refine(
    (p) => p.weeks.every((w) => w.days.length <= MAX_DAYS_PER_WEEK),
    `A week is limited to ${MAX_DAYS_PER_WEEK} days`
  );

export const programNormalizeRequestSchema = z.object({
  programText: z
    .string()
    .trim()
    .min(50, "That doesn't look like a full program")
    // Caps one-shot import cost/latency: a paste this size already produces a
    // large JSON document. Bigger programs are built in the editor or split —
    // one LLM call can't normalize a 12-week program anyway.
    .max(12_000, "Program is too long to import in one piece (max 12,000 characters) — try importing it a block at a time"),
});

export const programSuggestRequestSchema = z.object({
  program: boundedProgramSchema,
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(500, "Instruction is too long (max 500 characters)")
    .optional(),
});

export const programSaveSchema = z.object({
  title: z.string().trim().max(200).nullable().default(null),
  program: boundedProgramSchema,
});

export type ProgramNormalizeRequest = z.infer<typeof programNormalizeRequestSchema>;
export type ProgramSuggestRequest = z.infer<typeof programSuggestRequestSchema>;
export type ProgramSave = z.infer<typeof programSaveSchema>;
