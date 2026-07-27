"use client";

import { useState } from "react";
import { Sparkles, Undo2, X } from "lucide-react";
import type {
  ExercisePrescription,
  Program,
  Suggestion,
  UndoOp,
} from "@/lib/program";
import { formatIntensity, formatSetsReps } from "@/lib/program-format";
import { cn } from "@/lib/utils";

export type CardStatus = "pending" | "applied" | "stale";

export interface SuggestionCard {
  suggestion: Suggestion;
  status: CardStatus;
  /** Inverse operation captured at accept time; consumed by Undo. */
  undo?: UndoOp | null;
}

const KIND_LABELS: Record<Suggestion["kind"], string> = {
  modify_exercise: "Adjust",
  add_exercise: "Add exercise",
  remove_exercise: "Remove exercise",
  add_day: "Add day",
  remove_day: "Remove day",
  program_note: "Coach's note",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  sets: "Sets",
  reps_min: "Reps min",
  reps_max: "Reps max",
  amrap: "AMRAP",
  rpe: "RPE",
  rpe_max: "RPE max",
  percentage: "%1RM",
  superset_group: "Superset",
  notes: "Notes",
};

/**
 * The AI side of the editor: assessment, streaming suggestion cards, the
 * instruction box, and the credits readout. Pure presentation — every
 * action is a callback into the editor, which owns all program state.
 */
export function SuggestionPanel({
  program,
  assessment,
  cards,
  busy,
  aiUsed,
  aiLimit,
  onInsights,
  onInstruction,
  onAccept,
  onDismiss,
  onUndo,
}: {
  program: Program;
  assessment: string | null;
  cards: SuggestionCard[];
  busy: boolean;
  aiUsed: number;
  aiLimit: number;
  onInsights: () => void;
  onInstruction: (instruction: string) => void;
  onAccept: (card: SuggestionCard) => void;
  onDismiss: (card: SuggestionCard) => void;
  onUndo: (card: SuggestionCard) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const quotaSpent = aiUsed >= aiLimit;
  const started = busy || assessment !== null || cards.length > 0;

  function submitInstruction() {
    const trimmed = instruction.trim();
    if (!trimmed || busy || quotaSpent) return;
    onInstruction(trimmed);
    setInstruction("");
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          AI coach
        </h2>
        <span
          className={cn(
            "text-xs tabular-nums",
            quotaSpent ? "text-red-600" : "text-gray-400",
          )}
        >
          {aiUsed} / {aiLimit} AI actions
        </span>
      </div>

      {!started && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Get an overall read of this program plus specific, one-click
            improvements — each one explained, applied only if you accept it.
          </p>
          <button
            onClick={onInsights}
            disabled={quotaSpent}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-default cursor-pointer transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Get AI insights
          </button>
          <p className="text-xs text-gray-400">
            {quotaSpent
              ? "You've used this month's AI actions."
              : "Uses 1 AI action. Reviews the program as shown, unsaved edits included."}
          </p>
        </div>
      )}

      {busy && (
        <p className="text-sm text-gray-500 animate-pulse">
          Reviewing your program…
        </p>
      )}

      {assessment && <p className="text-sm text-gray-700">{assessment}</p>}

      {cards.length > 0 && (
        <ul className="space-y-2.5">
          {cards.map((card) => (
            <CardView
              key={card.suggestion.id}
              card={card}
              program={program}
              onAccept={() => onAccept(card)}
              onDismiss={() => onDismiss(card)}
              onUndo={() => onUndo(card)}
            />
          ))}
        </ul>
      )}

      {started && !busy && (
        <div className="pt-1 border-t border-gray-100">
          <label htmlFor="ai-instruction" className="sr-only">
            Ask for specific changes
          </label>
          <div className="flex gap-2 pt-3">
            <input
              id="ai-instruction"
              value={instruction}
              maxLength={500}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitInstruction()}
              placeholder='e.g. "make day 2 shorter"'
              disabled={quotaSpent}
              className="flex-1 min-w-0 rounded-full border border-gray-300 px-3.5 py-1.5 text-sm focus:border-gray-400 focus:outline-none placeholder:text-gray-400 disabled:opacity-50"
            />
            <button
              onClick={submitInstruction}
              disabled={!instruction.trim() || quotaSpent}
              className="rounded-full bg-neutral-950 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-default cursor-pointer transition-colors"
            >
              Ask
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Each request uses 1 AI action and replaces the cards above.
          </p>
        </div>
      )}
    </div>
  );
}

function CardView({
  card,
  program,
  onAccept,
  onDismiss,
  onUndo,
}: {
  card: SuggestionCard;
  program: Program;
  onAccept: () => void;
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const { suggestion, status } = card;
  const isNote = suggestion.kind === "program_note";

  return (
    <li
      className={cn(
        "rounded-lg border p-3 space-y-1.5",
        status === "applied" ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200",
        status === "stale" && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {KIND_LABELS[suggestion.kind]}
        </span>
        {status === "pending" && !isNote && (
          <span className="text-xs text-gray-400 truncate">
            {targetLabel(program, suggestion)}
          </span>
        )}
      </div>

      {status === "pending" && <ChangePreview program={program} suggestion={suggestion} />}

      <p className="text-sm text-gray-700">{suggestion.rationale}</p>

      {status === "pending" && (
        <div className="flex items-center gap-2 pt-0.5">
          {!isNote && (
            <button
              onClick={onAccept}
              className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white hover:bg-neutral-800 cursor-pointer transition-colors"
            >
              Accept
            </button>
          )}
          <button
            onClick={onDismiss}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            {isNote ? "Got it" : "Dismiss"}
          </button>
        </div>
      )}
      {status === "applied" && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs font-medium text-emerald-700">Applied</span>
          <button
            onClick={onUndo}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 cursor-pointer transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
        </div>
      )}
      {status === "stale" && (
        <p className="text-xs text-gray-400 italic">
          No longer applies — the affected part of the program changed.
        </p>
      )}
    </li>
  );
}

/** "Squat · Week 1, Day 2" / "Week 1, Day 2" / "Week 1" — whatever the id hits. */
function targetLabel(program: Program, suggestion: Suggestion): string {
  const id = suggestion.target_id;
  if (!id) return "";
  for (const week of program.weeks) {
    if (week.id === id) return week.label;
    for (const day of week.days) {
      if (day.id === id) return `${week.label}, ${day.label}`;
      const exercise = day.exercises.find((e) => e.id === id);
      if (exercise) return `${exercise.name} · ${week.label}, ${day.label}`;
    }
  }
  return "";
}

/** What accepting will change, concretely — before → after for modifies,
 * the prescription line for adds. */
function ChangePreview({
  program,
  suggestion,
}: {
  program: Program;
  suggestion: Suggestion;
}) {
  if (suggestion.kind === "modify_exercise") {
    const current = findExercise(program, suggestion.target_id);
    if (!current || !suggestion.payload) return null;
    const lines = Object.entries(suggestion.payload).map(([key, next]) => {
      const prev = current[key as keyof ExercisePrescription];
      return `${FIELD_LABELS[key] ?? key}: ${fmt(prev)} → ${fmt(next)}`;
    });
    return (
      <p className="text-xs text-gray-500 tabular-nums">{lines.join(" · ")}</p>
    );
  }

  if (suggestion.kind === "add_exercise" && suggestion.payload) {
    const exercise = suggestion.payload as unknown as ExercisePrescription;
    return (
      <p className="text-xs text-gray-500 tabular-nums">
        {exercise.name} — {formatSetsReps(exercise)} @ {formatIntensity(exercise)}
      </p>
    );
  }

  return null;
}

function findExercise(program: Program, id: string | null) {
  if (!id) return null;
  for (const week of program.weeks) {
    for (const day of week.days) {
      const exercise = day.exercises.find((e) => e.id === id);
      if (exercise) return exercise;
    }
  }
  return null;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
