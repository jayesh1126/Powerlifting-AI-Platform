/**
 * Client-safe Program contract. Mirrors orchestrator/app/models.py — change
 * both together.
 *
 * Field names stay snake_case to match the wire exactly: a renaming layer
 * would be one more mirror that can drift. Schemas add NO constraints beyond
 * the pydantic side — an extra bound here could reject a program the
 * orchestrator legitimately produced. Policy limits (12-week cap, paste
 * length) belong in schemas.ts, not in the contract.
 *
 * Node ids: orchestrator-assigned after normalization ("w1d2e3"), or
 * client-generated for manually added nodes (newNodeId), or
 * orchestrator-generated for AI-added nodes ("n" + hex). Ids are never
 * renumbered — suggestions target them by value.
 */
import { z } from "zod";

export const exercisePrescriptionSchema = z.object({
  id: z.string().default(""),
  name: z.string(),
  sets: z.number().int().nullable().default(null),
  reps_min: z.number().int().nullable().default(null),
  reps_max: z.number().int().nullable().default(null),
  amrap: z.boolean().default(false),
  rpe: z.number().nullable().default(null),
  rpe_max: z.number().nullable().default(null),
  percentage: z.number().nullable().default(null),
  superset_group: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  raw: z.string().nullable().default(null),
});

export const programDaySchema = z.object({
  id: z.string().default(""),
  label: z.string(),
  exercises: z.array(exercisePrescriptionSchema).default([]),
  notes: z.string().nullable().default(null),
});

export const programWeekSchema = z.object({
  id: z.string().default(""),
  label: z.string(),
  block: z.string().nullable().default(null),
  days: z.array(programDaySchema).default([]),
  notes: z.string().nullable().default(null),
});

export const programSchema = z.object({
  title: z.string().nullable().default(null),
  weeks: z.array(programWeekSchema).default([]),
  notes: z.string().nullable().default(null),
  warnings: z.array(z.string()).default([]),
});

export const suggestionKindSchema = z.enum([
  "modify_exercise",
  "add_exercise",
  "remove_exercise",
  "add_day",
  "remove_day",
  "program_note",
]);

export const suggestionSchema = z.object({
  id: z.string(),
  kind: suggestionKindSchema,
  target_id: z.string().nullable().default(null),
  payload: z.record(z.string(), z.unknown()).nullable().default(null),
  rationale: z.string(),
});

export type ExercisePrescription = z.infer<typeof exercisePrescriptionSchema>;
export type ProgramDay = z.infer<typeof programDaySchema>;
export type ProgramWeek = z.infer<typeof programWeekSchema>;
export type Program = z.infer<typeof programSchema>;
export type SuggestionKind = z.infer<typeof suggestionKindSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;

/** Id for nodes the user adds in the editor. "u" prefix distinguishes them
 * from positional ("w1d2e3") and AI-added ("n...") ids; uniqueness within
 * one program is all that matters. */
export function newNodeId(): string {
  return "u" + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Edit primitives — the ONE place a program changes shape. The manual editor
// calls these on keystrokes; applySuggestion calls the same ones when the
// user accepts an AI card. All immutable: the input program is never
// mutated, so Undo/Discard is simply keeping an older reference.
// ---------------------------------------------------------------------------

export interface EditResult {
  program: Program;
  found: boolean;
}

export function updateExercise(
  program: Program,
  exerciseId: string,
  patch: Partial<ExercisePrescription>,
): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        found = true;
        return { ...exercise, ...patch };
      }),
    })),
  }));
  return { program: found ? { ...program, weeks } : program, found };
}

export function insertExercise(
  program: Program,
  dayId: string,
  exercise: ExercisePrescription,
): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      if (day.id !== dayId) return day;
      found = true;
      return { ...day, exercises: [...day.exercises, exercise] };
    }),
  }));
  return { program: found ? { ...program, weeks } : program, found };
}

export function removeExercise(program: Program, exerciseId: string): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      exercises: day.exercises.filter((exercise) => {
        if (exercise.id === exerciseId) {
          found = true;
          return false;
        }
        return true;
      }),
    })),
  }));
  return { program: found ? { ...program, weeks } : program, found };
}

export function updateDay(
  program: Program,
  dayId: string,
  patch: Partial<ProgramDay>,
): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      if (day.id !== dayId) return day;
      found = true;
      return { ...day, ...patch };
    }),
  }));
  return { program: found ? { ...program, weeks } : program, found };
}

export function insertDay(program: Program, weekId: string, day: ProgramDay): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => {
    if (week.id !== weekId) return week;
    found = true;
    return { ...week, days: [...week.days, day] };
  });
  return { program: found ? { ...program, weeks } : program, found };
}

export function removeDay(program: Program, dayId: string): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => ({
    ...week,
    days: week.days.filter((day) => {
      if (day.id === dayId) {
        found = true;
        return false;
      }
      return true;
    }),
  }));
  return { program: found ? { ...program, weeks } : program, found };
}

export function updateWeek(
  program: Program,
  weekId: string,
  patch: Partial<ProgramWeek>,
): EditResult {
  let found = false;
  const weeks = program.weeks.map((week) => {
    if (week.id !== weekId) return week;
    found = true;
    return { ...week, ...patch };
  });
  return { program: found ? { ...program, weeks } : program, found };
}

export function addWeek(program: Program, week: ProgramWeek): Program {
  return { ...program, weeks: [...program.weeks, week] };
}

export function removeWeek(program: Program, weekId: string): EditResult {
  const weeks = program.weeks.filter((week) => week.id !== weekId);
  const found = weeks.length !== program.weeks.length;
  return { program: found ? { ...program, weeks } : program, found };
}

// Factories for user-created nodes (the editor's "+ add" actions).

export function blankExercise(): ExercisePrescription {
  return exercisePrescriptionSchema.parse({ id: newNodeId(), name: "" });
}

export function blankDay(label: string): ProgramDay {
  return programDaySchema.parse({ id: newNodeId(), label });
}

export function blankWeek(label: string): ProgramWeek {
  return programWeekSchema.parse({ id: newNodeId(), label });
}

// ---------------------------------------------------------------------------
// Undo for accepted suggestions. An inverse OPERATION, not a snapshot: a
// snapshot restore would clobber every manual edit made after accepting.
// buildUndo captures the inverse BEFORE the suggestion is applied;
// applyUndo executes it later against whatever the program has become.
// ---------------------------------------------------------------------------

export type UndoOp =
  | { kind: "patch_exercise"; target_id: string; patch: Partial<ExercisePrescription> }
  | { kind: "remove_exercise"; target_id: string }
  | { kind: "remove_day"; target_id: string }
  | { kind: "insert_exercise"; day_id: string; exercise: ExercisePrescription }
  | { kind: "insert_day"; week_id: string; day: ProgramDay };

export function buildUndo(program: Program, suggestion: Suggestion): UndoOp | null {
  const { kind, target_id, payload } = suggestion;

  switch (kind) {
    case "program_note":
      return null; // nothing is applied, nothing to undo

    case "modify_exercise": {
      for (const week of program.weeks) {
        for (const day of week.days) {
          const exercise = day.exercises.find((e) => e.id === target_id);
          if (!exercise) continue;
          // Previous values of exactly the patched fields — undo restores
          // those and touches nothing else.
          const patch: Record<string, unknown> = {};
          for (const key of Object.keys(payload ?? {})) {
            patch[key] = exercise[key as keyof ExercisePrescription];
          }
          return {
            kind: "patch_exercise",
            target_id: exercise.id,
            patch: patch as Partial<ExercisePrescription>,
          };
        }
      }
      return null;
    }

    case "add_exercise": {
      const id = (payload as { id?: string } | null)?.id;
      return id ? { kind: "remove_exercise", target_id: id } : null;
    }

    case "add_day": {
      const id = (payload as { id?: string } | null)?.id;
      return id ? { kind: "remove_day", target_id: id } : null;
    }

    case "remove_exercise": {
      for (const week of program.weeks) {
        for (const day of week.days) {
          const exercise = day.exercises.find((e) => e.id === target_id);
          if (exercise) {
            // Re-insert appends; the original position is the one thing
            // undo accepts losing.
            return { kind: "insert_exercise", day_id: day.id, exercise };
          }
        }
      }
      return null;
    }

    case "remove_day": {
      for (const week of program.weeks) {
        const day = week.days.find((d) => d.id === target_id);
        if (day) return { kind: "insert_day", week_id: week.id, day };
      }
      return null;
    }
  }
}

export function applyUndo(program: Program, undo: UndoOp): EditResult {
  switch (undo.kind) {
    case "patch_exercise":
      return updateExercise(program, undo.target_id, undo.patch);
    case "remove_exercise":
      return removeExercise(program, undo.target_id);
    case "remove_day":
      return removeDay(program, undo.target_id);
    case "insert_exercise":
      return insertExercise(program, undo.day_id, undo.exercise);
    case "insert_day":
      return insertDay(program, undo.week_id, undo.day);
  }
}

export type ApplyResult =
  | { ok: true; program: Program }
  | { ok: false; reason: "target_missing" | "invalid_payload" };

/**
 * Apply an accepted suggestion, in terms of the edit primitives above —
 * accepted AI cards and manual keystrokes change the program through the
 * exact same code. Stale targets (user deleted the node after the
 * suggestion arrived) are an expected UI state, hence a result, not an
 * exception.
 *
 * Trust boundary: the orchestrator already validated kinds, target types
 * and payload shapes; modify payloads are spread as-is (explicit nulls
 * clear fields). Add payloads are re-parsed because they must be complete
 * objects — cheap insurance at the last hop before the user's screen.
 */
export function applySuggestion(program: Program, suggestion: Suggestion): ApplyResult {
  const { kind, target_id, payload } = suggestion;

  switch (kind) {
    case "program_note":
      // Advice only — nothing to change; the card itself is the payload.
      return { ok: true, program };

    case "modify_exercise": {
      const result = updateExercise(
        program,
        target_id ?? "",
        payload as Partial<ExercisePrescription>,
      );
      if (!result.found) return { ok: false, reason: "target_missing" };
      return { ok: true, program: result.program };
    }

    case "remove_exercise": {
      const result = removeExercise(program, target_id ?? "");
      if (!result.found) return { ok: false, reason: "target_missing" };
      return { ok: true, program: result.program };
    }

    case "add_exercise": {
      const parsed = exercisePrescriptionSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, reason: "invalid_payload" };
      const result = insertExercise(program, target_id ?? "", parsed.data);
      if (!result.found) return { ok: false, reason: "target_missing" };
      return { ok: true, program: result.program };
    }

    case "add_day": {
      const parsed = programDaySchema.safeParse(payload);
      if (!parsed.success) return { ok: false, reason: "invalid_payload" };
      const result = insertDay(program, target_id ?? "", parsed.data);
      if (!result.found) return { ok: false, reason: "target_missing" };
      return { ok: true, program: result.program };
    }

    case "remove_day": {
      const result = removeDay(program, target_id ?? "");
      if (!result.found) return { ok: false, reason: "target_missing" };
      return { ok: true, program: result.program };
    }
  }
}
