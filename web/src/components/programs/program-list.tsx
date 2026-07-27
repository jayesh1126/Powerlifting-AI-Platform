"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { ProgramListItem } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Fixed locale so server render and browser hydration agree.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ProgramList({ programs }: { programs: ProgramListItem[] }) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<ProgramListItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/programs/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete program");
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete program");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {programs.map((program) => (
          <li key={program.id} className="flex items-center gap-2 px-4 py-3">
            <ClipboardList className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <Link
              href={`/programs/${program.id}`}
              className="flex-1 min-w-0 group"
            >
              <span className="block truncate font-medium text-gray-900 group-hover:underline">
                {program.title || "Untitled program"}
              </span>
              <span className="block text-xs text-gray-400">
                Updated {dateFormat.format(new Date(program.updated_at))}
              </span>
            </Link>
            <button
              onClick={() => setPendingDelete(program)}
              className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              aria-label={`Delete ${program.title || "untitled program"}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this program?"
        description={`"${pendingDelete?.title || "Untitled program"}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}
