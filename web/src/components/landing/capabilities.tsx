import { EXAMPLE_PROMPTS } from "@/lib/example-prompts";

export function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-14 bg-white text-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-bold uppercase sm:text-5xl">
            One coach, three jobs
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Everything runs through the same runtime: your question is planned,
            the right knowledge and data are retrieved, and the answer is
            checked before it reaches you.
          </p>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
          <div className="border-t-2 border-neutral-950 pt-6">
            <h3 className="text-xl font-bold">Technique &amp; training Q&amp;A</h3>
            <p className="mt-3 text-neutral-600">
              Form breakdowns, weak-point diagnosis, recovery and meet-prep
              questions — answered from a curated corpus of respected coaching
              material, not the open internet.
            </p>
          </div>

          <div className="border-t-2 border-neutral-950 pt-6">
            <h3 className="text-xl font-bold">
              Program design &amp; review{" "}
            </h3>
            <p className="mt-3 text-neutral-600">
              Blocks built around your meet date, lifts, and training history.
              Upload-your-program reviews are next:
            </p>
            <p className="mt-3">
              <span className="rounded-full bg-red-600/10 px-3 py-1 text-sm font-semibold text-red-700">
                Program review — coming soon
              </span>
            </p>
          </div>

          <div className="border-t-2 border-neutral-950 pt-6">
            <h3 className="text-xl font-bold">Competition analytics</h3>
            <p className="mt-3 text-neutral-600">
              Query real meet results: compare lifters, track progressions, and
              see where your total sits in your weight class and federation.
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-xs tracking-wide text-neutral-500 uppercase">
            Ask it things like
          </span>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <span
              key={prompt}
              className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-sm text-neutral-700"
            >
              {prompt}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
