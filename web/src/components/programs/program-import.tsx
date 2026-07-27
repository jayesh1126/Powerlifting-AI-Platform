"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { pillBase, pillSizes, pillVariants } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

const MIN_CHARS = 50;
const MAX_CHARS = 12_000;

/**
 * Paste -> normalize -> editor. On success the program row is created
 * immediately (title from the AI's read of the paste) and the user lands
 * in the editor — same create-then-edit flow as the blank-program button.
 * A rejection ("that's not a program") keeps the paste intact and costs
 * nothing.
 */
export function ProgramImport({
  aiUsed,
  aiLimit,
}: {
  aiUsed: number;
  aiLimit: number;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  // Server-rendered count, bumped locally when a charged call completes so
  // the readout stays honest without a refetch.
  const [used, setUsed] = useState(aiUsed);

  const quotaSpent = used >= aiLimit;
  const tooShort = text.trim().length < MIN_CHARS;
  const tooLong = text.length > MAX_CHARS;

  async function submit() {
    if (busy || quotaSpent || tooShort || tooLong) return;
    setBusy(true);
    setRejection(null);
    try {
      const res = await fetch("/api/programs/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programText: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 422 (too large / over the caps) is a completed, charged call;
        // other failures are ours and free.
        if (res.status === 422) setUsed((n) => n + 1);
        throw new Error(data?.message ?? "Couldn't process this program");
      }

      if (!data.isProgram) {
        // The system worked; the input wasn't a program. Keep the paste,
        // explain calmly. The model still did the work, so it charged.
        setUsed((n) => n + 1);
        setRejection(data.reason ?? "This doesn't look like a training program.");
        return;
      }

      const created = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.program.title ?? "Imported program",
          program: data.program,
        }),
      });
      const createdData = await created.json().catch(() => null);
      if (!created.ok || !createdData?.id) {
        throw new Error("Your program was read but couldn't be saved — try again");
      }
      router.push(`/programs/${createdData.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't process this program");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-mono text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Paste your program
        </h2>
        <p className="text-sm text-gray-600 mt-1.5">
          Any format works — spreadsheet rows, coach&apos;s notes, your own
          shorthand. The AI reads it into an editable grid; you review and
          fix anything it got wrong before saving.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRejection(null);
        }}
        rows={12}
        placeholder={
          "week 1 day 1: squat 3x5 @ RPE 7, bench 3x8-10 rpe 7-8\nday 2: deadlift 2x3 @ 80%, rows 3xAMRAP\nweek 2 same but heavier..."
        }
        className="w-full rounded-lg border border-gray-300 p-3 text-sm font-mono focus:border-gray-400 focus:outline-none placeholder:text-gray-300 resize-y"
      />

      {rejection && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <p className="text-sm text-gray-700">
            This doesn&apos;t look like a training program:{" "}
            <span className="text-gray-500">{rejection}</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            This used 1 AI action. Edit the text and try again.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs tabular-nums",
            tooLong ? "text-red-600" : "text-gray-400",
          )}
        >
          {text.length.toLocaleString("en-GB")} / {MAX_CHARS.toLocaleString("en-GB")}{" "}
          characters
          {quotaSpent
            ? " — you've used this month's AI actions"
            : ` · uses 1 AI action (${used}/${aiLimit} used)`}
        </p>
        <button
          onClick={submit}
          disabled={busy || quotaSpent || tooShort || tooLong}
          className={cn(
            pillBase,
            pillVariants.dark,
            pillSizes.sm,
            "disabled:opacity-40 disabled:cursor-default",
          )}
        >
          <Sparkles className="h-4 w-4" />
          {busy ? "Reading your program… (up to a minute for long ones)" : "Analyze & import"}
        </button>
      </div>
    </div>
  );
}
