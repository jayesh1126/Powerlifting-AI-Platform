/**
 * Display formatting for program prescriptions. Client-safe and pure —
 * shared by the editor grid and the markdown export so what the user sees
 * on screen and what they download are guaranteed to read identically.
 */
import type { ExercisePrescription } from "@/lib/program";

/** "3×5", "3×8–10", "3×AMRAP", "AMRAP", "3 sets", or "—". */
export function formatSetsReps(exercise: ExercisePrescription): string {
  const { sets, reps_min, reps_max, amrap } = exercise;

  const reps = amrap
    ? "AMRAP"
    : reps_min === null
      ? null
      : reps_max !== null && reps_max !== reps_min
        ? `${reps_min}–${reps_max}`
        : `${reps_min}`;

  if (sets !== null && reps !== null) return `${sets}×${reps}`;
  if (sets !== null) return `${sets} sets`;
  if (reps !== null) return reps;
  return "—";
}

/** "RPE 7", "RPE 7–8", "80%", "RPE 7 · 80%", or "—". */
export function formatIntensity(exercise: ExercisePrescription): string {
  const { rpe, rpe_max, percentage } = exercise;
  const parts: string[] = [];

  if (rpe !== null) {
    parts.push(
      rpe_max !== null && rpe_max !== rpe ? `RPE ${rpe}–${rpe_max}` : `RPE ${rpe}`,
    );
  }
  if (percentage !== null) parts.push(`${percentage}%`);

  return parts.length ? parts.join(" · ") : "—";
}
