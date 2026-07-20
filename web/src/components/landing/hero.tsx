import { AuthCta } from "@/components/landing/auth-cta";
import { KNOWLEDGE_SOURCES } from "@/components/landing/sources";

export function Hero({
  isAuthed,
  authError,
}: {
  isAuthed: boolean;
  authError: boolean;
}) {
  return (
    <section className="bg-neutral-950 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[7fr_5fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div>
          <h1 className="animate-rise font-display text-[clamp(3.25rem,9vw,5.75rem)] leading-[0.92] font-extrabold text-balance uppercase">
            Powerlifting answers, grounded in{" "}
            <span className="text-red-500">evidence</span>.
          </h1>

          <p className="animate-rise mt-6 max-w-[52ch] text-lg text-neutral-300 [animation-delay:90ms]">
            An AI coach for the platform. Ask about technique, programming, and
            meet prep — answered from the published work of coaches lifters
            actually trust, and from millions of real competition results.
          </p>

          {authError && (
            <p
              role="alert"
              className="mt-6 max-w-sm rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300"
            >
              Sign-in failed. Please try again.
            </p>
          )}

          <div className="animate-rise mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 [animation-delay:180ms]">
            <AuthCta isAuthed={isAuthed} variant="light" />
            <span className="text-sm text-neutral-400">
              15 questions a month, free. No card needed.
            </span>
          </div>

          <p className="animate-rise mt-12 font-mono text-xs tracking-wide text-neutral-400 [animation-delay:270ms]">
            3M+ meet results · {KNOWLEDGE_SOURCES.length} named knowledge
            sources · built only for powerlifting
          </p>
        </div>

        <ChatExchange />
      </div>
    </section>
  );
}

/**
 * A static, illustrative product exchange — the hero's imagery is the product
 * itself rather than stock photography.
 */
function ChatExchange() {
  return (
    <figure className="animate-rise self-center [animation-delay:240ms]">
      <div className="rounded-2xl border border-white/10 bg-neutral-900 p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-red-600 px-4 py-3 text-sm text-white">
            My hips shoot up out of the hole on heavy squats. What&apos;s
            breaking down?
          </div>

          <div className="mr-auto max-w-[92%] rounded-2xl rounded-bl-sm bg-white/5 px-4 py-3 text-sm leading-relaxed text-neutral-200">
            <p>
              Hips rising faster than the bar usually means your quads give out
              first, shifting the load to your hips and back. Three fixes worth
              trying:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-300">
              <li>Pause squats at your sticking depth to build leg drive.</li>
              <li>Slow eccentrics around 70% to own the bottom position.</li>
              <li>
                Check your brace — losing upper-back tightness lets the bar
                drift forward.
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-2 pl-1">
            <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-neutral-400">
              squat-technique
            </span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-neutral-400">
              programming
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-neutral-500">
        An illustrative exchange.
      </figcaption>
    </figure>
  );
}
