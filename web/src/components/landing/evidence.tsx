import { KNOWLEDGE_SOURCES } from "@/components/landing/sources";

export function Evidence() {
  return (
    <section id="evidence" className="scroll-mt-14 bg-neutral-50 text-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-bold uppercase sm:text-5xl">
            Show the receipts
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            No mystery training data. The knowledge comes from named coaches
            and educators, and the numbers come from real meets.
          </p>
        </div>

        <div className="mt-14 grid gap-x-16 gap-y-14 lg:grid-cols-[5fr_7fr]">
          <div>
            <h3 className="text-xl font-bold">
              Competition data:{" "}
              <span className="text-red-600">OpenPowerlifting</span>
            </h3>
            <p className="mt-3 text-neutral-600">
              Lifter comparisons and trend analysis run against the
              OpenPowerlifting archive — a community-built, public-domain
              record of over three million competition results from
              federations worldwide.
            </p>
            <p className="mt-4 text-sm text-neutral-500">
              This site uses data from the OpenPowerlifting project,{" "}
              <a
                href="https://www.openpowerlifting.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-red-600"
              >
                openpowerlifting.org
              </a>
              . You may download a copy of the data at{" "}
              <a
                href="https://data.openpowerlifting.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-red-600"
              >
                data.openpowerlifting.org
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-xl font-bold">
              Knowledge: the coaches lifters actually watch
            </h3>
            <p className="mt-3 text-neutral-600">
              The knowledge base is curated from the publicly available
              educational work of these coaches, researchers, and publications:
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
              {KNOWLEDGE_SOURCES.map((source) => (
                <li key={source.href}>
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-neutral-800 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-red-600 hover:decoration-red-300"
                  >
                    {source.name}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-neutral-500">
              Insights are synthesized from publicly available content.
              PowerliftingAI is an independent project and is not affiliated
              with or endorsed by any of the people or organizations above.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
