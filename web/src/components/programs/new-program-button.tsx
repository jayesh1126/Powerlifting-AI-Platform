"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { pillBase, pillSizes } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

/**
 * Creates a blank one-week program and jumps into it. Saving is free (no
 * AI, no quota), so this can be a single click with no ceremony.
 */
export function NewProgramButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled program",
          program: {
            weeks: [
              { id: "w1", label: "Week 1", days: [{ id: "w1d1", label: "Day 1" }] },
            ],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) {
        throw new Error(data.message ?? "Failed to create program");
      }
      router.push(`/programs/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create program");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={create}
      disabled={busy}
      className={cn(
        pillBase,
        pillSizes.sm,
        "border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60",
      )}
    >
      <Plus className="h-4 w-4" />
      {busy ? "Creating..." : "Start blank"}
    </button>
  );
}
