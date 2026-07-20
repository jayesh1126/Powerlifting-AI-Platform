import { AuthCta } from "@/components/landing/auth-cta";

export function ClosingCta({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="bg-neutral-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-20">
        <div>
          <h2 className="font-display text-4xl font-bold uppercase sm:text-5xl">
            Train on <span className="text-red-500">evidence</span>
          </h2>
          <p className="mt-3 max-w-[48ch] text-neutral-400">
            Fifteen questions a month, free. Ask the thing you&apos;d normally
            ask a coach — and see where the answer comes from.
          </p>
        </div>
        <AuthCta isAuthed={isAuthed} variant="light" className="shrink-0" />
      </div>
    </section>
  );
}
