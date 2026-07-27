/**
 * Program -> markdown, for the download button. Built on the same
 * formatters as the editor grid so the file reads exactly like the screen.
 * Client-safe and pure.
 */
import type { Program } from "@/lib/program";
import { formatIntensity, formatSetsReps } from "@/lib/program-format";

export function programToMarkdown(title: string, program: Program): string {
  const lines: string[] = [`# ${title}`];
  if (program.notes) lines.push("", program.notes);

  for (const week of program.weeks) {
    lines.push("", `## ${week.label}${week.block ? ` — ${week.block}` : ""}`);
    if (week.notes) lines.push("", week.notes);

    for (const day of week.days) {
      lines.push("", `### ${day.label}`);
      if (day.notes) lines.push("", day.notes);

      if (day.exercises.length === 0) {
        lines.push("", "_No exercises._");
        continue;
      }
      lines.push(
        "",
        "| Exercise | Sets × Reps | Intensity | Notes |",
        "| --- | --- | --- | --- |",
      );
      for (const exercise of day.exercises) {
        const name = exercise.superset_group
          ? `${exercise.name} [${exercise.superset_group}]`
          : exercise.name;
        lines.push(
          `| ${escapeCell(name)} | ${formatSetsReps(exercise)} | ${formatIntensity(exercise)} | ${escapeCell(exercise.notes ?? "")} |`,
        );
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** A literal "|" in an exercise name or note would break the table row. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/** "My 5-Week Peak!" -> "my-5-week-peak.md" */
export function programFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "program"}.md`;
}
