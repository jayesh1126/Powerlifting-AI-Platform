"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  addWeek,
  blankDay,
  blankExercise,
  blankWeek,
  insertDay,
  insertExercise,
  removeDay,
  removeExercise,
  removeWeek,
  updateDay,
  updateExercise,
  updateWeek,
  type ExercisePrescription,
  type Program,
} from "@/lib/program";
import { MAX_DAYS_PER_WEEK, MAX_PROGRAM_WEEKS } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * The editable program surface: week tabs over per-day exercise tables,
 * spreadsheet-style. Every change flows through the edit primitives in
 * @/lib/program (the same ones accepted AI suggestions use) and comes back
 * via onChange — the grid owns no program state, only week selection.
 */
export function ProgramGrid({
  program,
  onChange,
}: {
  program: Program;
  onChange: (program: Program) => void;
}) {
  const [weekIndex, setWeekIndex] = useState(0);
  const week = program.weeks[Math.min(weekIndex, program.weeks.length - 1)];

  function handleAddWeek() {
    if (program.weeks.length >= MAX_PROGRAM_WEEKS) return;
    onChange(addWeek(program, blankWeek(`Week ${program.weeks.length + 1}`)));
    setWeekIndex(program.weeks.length);
  }

  function handleRemoveWeek(weekId: string) {
    onChange(removeWeek(program, weekId).program);
    setWeekIndex((i) => Math.max(0, i - 1));
  }

  return (
    <div className="space-y-4">
      {/* Week tabs */}
      <div
        role="tablist"
        aria-label="Weeks"
        className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px"
      >
        {program.weeks.map((w, i) => (
          <button
            key={w.id}
            role="tab"
            aria-selected={i === weekIndex}
            onClick={() => setWeekIndex(i)}
            className={cn(
              "shrink-0 px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors cursor-pointer",
              i === weekIndex
                ? "bg-neutral-950 text-white"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
            )}
          >
            {w.label || `Week ${i + 1}`}
          </button>
        ))}
        {program.weeks.length < MAX_PROGRAM_WEEKS && (
          <button
            onClick={handleAddWeek}
            className="shrink-0 px-2.5 py-1.5 text-sm text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-t-md transition-colors cursor-pointer"
            aria-label="Add week"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {!week ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No weeks yet — add one to get started.
        </p>
      ) : (
        <div className="space-y-5">
          {/* Week header: editable label + remove */}
          <div className="flex items-center justify-between gap-2">
            <input
              value={week.label}
              onChange={(e) =>
                onChange(updateWeek(program, week.id, { label: e.target.value }).program)
              }
              aria-label="Week label"
              className={cellInput("font-semibold text-gray-900 w-40")}
            />
            <button
              onClick={() => handleRemoveWeek(week.id)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove week
            </button>
          </div>

          {/* Days */}
          {week.days.map((day) => (
            <section key={day.id}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <input
                  value={day.label}
                  onChange={(e) =>
                    onChange(updateDay(program, day.id, { label: e.target.value }).program)
                  }
                  aria-label="Day label"
                  className={cellInput(
                    "font-mono text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-40",
                  )}
                />
                <button
                  onClick={() => onChange(removeDay(program, day.id).program)}
                  className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  aria-label={`Remove ${day.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-2 py-2 font-medium min-w-40">Exercise</th>
                      <th className="px-2 py-2 font-medium">Sets</th>
                      <th className="px-2 py-2 font-medium">Reps</th>
                      <th className="px-2 py-2 font-medium">AMRAP</th>
                      <th className="px-2 py-2 font-medium">RPE</th>
                      <th className="px-2 py-2 font-medium">%1RM</th>
                      <th className="px-2 py-2 font-medium min-w-40">Notes</th>
                      <th className="w-9" aria-hidden />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {day.exercises.map((exercise) => (
                      <ExerciseRow
                        key={exercise.id}
                        exercise={exercise}
                        onPatch={(patch) =>
                          onChange(updateExercise(program, exercise.id, patch).program)
                        }
                        onRemove={() =>
                          onChange(removeExercise(program, exercise.id).program)
                        }
                      />
                    ))}
                  </tbody>
                </table>
                {day.exercises.length === 0 && (
                  <p className="text-sm text-gray-400 px-3 py-3">No exercises yet.</p>
                )}
              </div>

              <button
                onClick={() =>
                  onChange(insertExercise(program, day.id, blankExercise()).program)
                }
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add exercise
              </button>
            </section>
          ))}

          {week.days.length < MAX_DAYS_PER_WEEK && (
            <button
              onClick={() =>
                onChange(
                  insertDay(program, week.id, blankDay(`Day ${week.days.length + 1}`)).program,
                )
              }
              className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add day
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseRow({
  exercise,
  onPatch,
  onRemove,
}: {
  exercise: ExercisePrescription;
  onPatch: (patch: Partial<ExercisePrescription>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="align-middle">
      <td className="px-2 py-1">
        <input
          value={exercise.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Exercise name"
          aria-label="Exercise name"
          className={cellInput("w-full min-w-36 font-medium text-gray-900")}
        />
      </td>
      <td className="px-2 py-1">
        <NumInput
          value={exercise.sets}
          onChange={(sets) => onPatch({ sets })}
          label="Sets"
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-0.5">
          <NumInput
            value={exercise.reps_min}
            onChange={(reps_min) => onPatch({ reps_min })}
            label="Reps min"
            disabled={exercise.amrap}
          />
          <span className="text-gray-300">–</span>
          <NumInput
            value={exercise.reps_max}
            onChange={(reps_max) => onPatch({ reps_max })}
            label="Reps max"
            disabled={exercise.amrap}
          />
        </div>
      </td>
      <td className="px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={exercise.amrap}
          onChange={(e) =>
            onPatch(
              e.target.checked
                ? { amrap: true, reps_min: null, reps_max: null }
                : { amrap: false },
            )
          }
          aria-label="AMRAP"
          className="h-3.5 w-3.5 accent-neutral-950 cursor-pointer"
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-0.5">
          <NumInput
            value={exercise.rpe}
            onChange={(rpe) => onPatch({ rpe })}
            label="RPE"
            step={0.5}
          />
          <span className="text-gray-300">–</span>
          <NumInput
            value={exercise.rpe_max}
            onChange={(rpe_max) => onPatch({ rpe_max })}
            label="RPE max"
            step={0.5}
          />
        </div>
      </td>
      <td className="px-2 py-1">
        <NumInput
          value={exercise.percentage}
          onChange={(percentage) => onPatch({ percentage })}
          label="Percentage of 1RM"
          width="w-14"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={exercise.notes ?? ""}
          onChange={(e) => onPatch({ notes: e.target.value === "" ? null : e.target.value })}
          aria-label="Notes"
          className={cellInput("w-full min-w-36 text-gray-600")}
        />
      </td>
      <td className="px-1 py-1 text-center">
        <button
          onClick={onRemove}
          className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          aria-label={`Remove ${exercise.name || "exercise"}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

/** Borderless-until-focus input: dense like a table, editable like a sheet. */
function cellInput(extra: string) {
  return cn(
    "rounded px-1.5 py-1 text-sm bg-transparent border border-transparent",
    "hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none",
    "placeholder:text-gray-300 transition-colors",
    extra,
  );
}

function NumInput({
  value,
  onChange,
  label,
  step = 1,
  width = "w-12",
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  step?: number;
  width?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={0}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      aria-label={label}
      className={cellInput(cn(width, "tabular-nums", disabled && "opacity-40"))}
    />
  );
}
