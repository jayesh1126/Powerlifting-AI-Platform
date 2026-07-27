"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import {
  applySuggestion,
  applyUndo,
  buildUndo,
  programSchema,
  type Program,
} from "@/lib/program";
import { parseProgramStream } from "@/lib/program-protocol";
import { programFilename, programToMarkdown } from "@/lib/program-markdown";
import { ProgramGrid } from "@/components/programs/program-grid";
import {
  SuggestionPanel,
  type SuggestionCard,
} from "@/components/programs/suggestion-panel";
import { pillBase, pillSizes, pillVariants } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

/**
 * Owns the editing session: program + title state, the dirty flag, and the
 * explicit Save. Nothing reaches the DB until Save — which is why
 * destructive grid edits need no confirmation dialogs: Discard (reset to
 * the last-saved state) is the safety net.
 *
 * Unsaved-work protection is three layers: a sessionStorage draft (survives
 * refresh), a beforeunload warning (tab close / real navigation), and a
 * capture-phase link interceptor (client-side navigation, which never
 * unloads the page and so never fires beforeunload).
 */
export function ProgramEditor({
  programId,
  initialTitle,
  initialProgram,
  initialAiUsed,
  aiLimit,
}: {
  programId: string;
  initialTitle: string;
  initialProgram: Program;
  initialAiUsed: number;
  aiLimit: number;
}) {
  // The last-saved state; Discard resets to it, Save advances it.
  const savedRef = useRef({ title: initialTitle, program: initialProgram });
  const [title, setTitle] = useState(initialTitle);
  const [program, setProgram] = useState(initialProgram);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI panel state. A new request replaces the previous review — applied
  // changes already live in the program, so the panel always shows the
  // latest ask.
  const [aiBusy, setAiBusy] = useState(false);
  const [assessment, setAssessment] = useState<string | null>(null);
  const [cards, setCards] = useState<SuggestionCard[]>([]);
  const [aiUsed, setAiUsed] = useState(initialAiUsed);

  const draftKey = `program-draft-${programId}`;

  // Restore a draft from a refreshed/abandoned session. Must run after
  // hydration (reading sessionStorage during the initial render would make
  // server and client HTML disagree); deferred to a microtask so the
  // restore is one clean post-commit update.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (!raw) return;
        const draft = JSON.parse(raw);
        const parsed = programSchema.safeParse(draft.program);
        if (!parsed.success) return;
        setTitle(typeof draft.title === "string" ? draft.title : "");
        setProgram(parsed.data);
        setDirty(true);
        toast("Restored your unsaved changes");
      } catch {
        /* corrupt draft — start from the saved program */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft on every change while dirty.
  useEffect(() => {
    if (!dirty) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ title, program }));
    } catch {
      /* storage full/blocked — beforeunload still guards */
    }
  }, [dirty, title, program, draftKey]);

  // Tab close / hard navigation: the browser's native warning.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Client-side navigation (header links, back link) swaps components
  // without unloading, so beforeunload never fires. Intercept link clicks
  // in the capture phase — before Next's router sees them — and confirm.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function changeProgram(next: Program) {
    setProgram(next);
    setDirty(true);
  }

  function discard() {
    setTitle(savedRef.current.title);
    setProgram(savedRef.current.program);
    setDirty(false);
    clearDraft();
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/programs/${programId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null, program }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "Failed to save program");
      savedRef.current = { title, program };
      setDirty(false);
      clearDraft();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save program");
    } finally {
      setSaving(false);
    }
  }

  async function requestSuggestions(instruction: string | null) {
    if (aiBusy) return;
    setAiBusy(true);
    setAssessment(null);
    setCards([]);
    try {
      const res = await fetch("/api/programs/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program, instruction: instruction ?? undefined }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Couldn't generate suggestions");
      }
      let completed = false;
      for await (const event of parseProgramStream(res.body)) {
        if (event.type === "assessment") {
          setAssessment(event.text);
        } else if (event.type === "suggestion") {
          setCards((c) => [...c, { suggestion: event.suggestion, status: "pending" }]);
        } else if (event.type === "error") {
          throw new Error(event.message);
        } else if (event.type === "done") {
          completed = true;
        }
      }
      // Quota is charged server-side on successful completion; mirror it
      // locally so the readout stays honest without a refetch.
      if (completed) setAiUsed((n) => n + 1);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't generate suggestions",
      );
    } finally {
      setAiBusy(false);
    }
  }

  function acceptCard(card: SuggestionCard) {
    // Inverse computed BEFORE applying — see buildUndo.
    const undo = buildUndo(program, card.suggestion);
    const result = applySuggestion(program, card.suggestion);
    if (!result.ok) {
      setCards((cs) =>
        cs.map((c) => (c === card ? { ...c, status: "stale" as const } : c)),
      );
      return;
    }
    changeProgram(result.program);
    setCards((cs) =>
      cs.map((c) => (c === card ? { ...c, status: "applied" as const, undo } : c)),
    );
  }

  function dismissCard(card: SuggestionCard) {
    setCards((cs) => cs.filter((c) => c !== card));
  }

  function undoCard(card: SuggestionCard) {
    if (!card.undo) return;
    const result = applyUndo(program, card.undo);
    if (!result.found) {
      toast.error("Can't undo — the affected part of the program has changed");
      return;
    }
    changeProgram(result.program);
    setCards((cs) =>
      cs.map((c) => (c === card ? { ...c, status: "pending" as const, undo: null } : c)),
    );
  }

  function download() {
    // Exports what's on screen, unsaved edits included — the user is
    // downloading what they see.
    const displayTitle = title.trim() || "Untitled program";
    const blob = new Blob([programToMarkdown(displayTitle, program)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = programFilename(displayTitle);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder="Untitled program"
          aria-label="Program title"
          className="flex-1 min-w-52 rounded px-1 py-0.5 font-display text-3xl font-bold uppercase bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none placeholder:text-gray-300 transition-colors"
        />
        <div className="flex items-center gap-3">
          {dirty && (
            <>
              <span className="text-xs text-gray-400">Unsaved changes</span>
              <button
                onClick={discard}
                disabled={saving}
                className="px-4 py-2 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Discard
              </button>
            </>
          )}
          <button
            onClick={download}
            className="p-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Download as markdown"
            title="Download as markdown"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={cn(
              pillBase,
              pillVariants.dark,
              pillSizes.sm,
              "disabled:opacity-40 disabled:cursor-default",
            )}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="lg:flex lg:items-start lg:gap-5">
        <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <ProgramGrid program={program} onChange={changeProgram} />
        </div>
        <aside className="mt-5 lg:mt-0 lg:w-80 lg:shrink-0">
          <SuggestionPanel
            program={program}
            assessment={assessment}
            cards={cards}
            busy={aiBusy}
            aiUsed={aiUsed}
            aiLimit={aiLimit}
            onInsights={() => requestSuggestions(null)}
            onInstruction={(instruction) => requestSuggestions(instruction)}
            onAccept={acceptCard}
            onDismiss={dismissCard}
            onUndo={undoCard}
          />
        </aside>
      </div>
    </div>
  );
}
