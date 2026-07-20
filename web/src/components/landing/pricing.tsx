import { Check } from "lucide-react";
import { AuthCta } from "@/components/landing/auth-cta";

function PlanFeature({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Check
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${muted ? "text-neutral-400" : "text-red-600"}`}
      />
      <span className={muted ? "text-neutral-500" : "text-neutral-700"}>
        {children}
      </span>
    </li>
  );
}

export function Pricing({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section id="pricing" className="scroll-mt-14 bg-white text-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-bold uppercase sm:text-5xl">
            Free to start
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            The free tier is the whole product today. A paid tier arrives once
            program reviews do.
          </p>
        </div>

        <div className="mt-14 grid max-w-4xl gap-6 sm:grid-cols-2">
          <div className="flex flex-col rounded-2xl border-2 border-neutral-950 p-7">
            <h3 className="text-lg font-bold">Free</h3>
            <p className="mt-2">
              <span className="font-display text-5xl font-bold">£0</span>
              <span className="ml-1.5 text-neutral-500">/ month</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <PlanFeature>15 questions a month</PlanFeature>
              <PlanFeature>
                Full knowledge base — technique, programming, meet prep
              </PlanFeature>
              <PlanFeature>
                Competition-data lookups on OpenPowerlifting results
              </PlanFeature>
              <PlanFeature>
                1 program review a month{" "}
                <span className="ml-1 rounded-full bg-red-600/10 px-2 py-0.5 text-xs font-semibold text-red-700">
                  coming soon
                </span>
              </PlanFeature>
            </ul>
            <div className="mt-8 flex-1" />
            <AuthCta
              isAuthed={isAuthed}
              variant="dark"
              className="w-full"
              label="Start free with Google"
            />
          </div>

          <div className="flex flex-col rounded-2xl border border-neutral-200 bg-neutral-50 p-7">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-700">Pro</h3>
              <span className="rounded-full border border-neutral-300 px-2.5 py-1 font-mono text-[11px] tracking-wide text-neutral-500 uppercase">
                Coming soon
              </span>
            </div>
            <p className="mt-2">
              <span className="font-display text-5xl font-bold text-neutral-700">
                £4.99
              </span>
              <span className="ml-1.5 text-neutral-500">/ month</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <PlanFeature muted>Higher monthly question limits</PlanFeature>
              <PlanFeature muted>More program reviews</PlanFeature>
              <PlanFeature muted>First access to new tools</PlanFeature>
            </ul>
            <div className="mt-8 flex-1" />
            <p className="text-sm text-neutral-500">
              Not available yet — start on the free tier and you&apos;ll be the
              first to know.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
