import { KNOWLEDGE_SOURCES } from "@/components/landing/sources";

export const metadata = { title: "About – PowerliftingAI Ltd" };

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="font-display text-4xl font-bold uppercase sm:text-5xl mb-6">
        About <span className="text-red-600">PowerliftingAI Ltd</span>
      </h1>

      <p className="mb-4">
        <strong>PowerliftingAI Ltd</strong> is an independent technology company
        based in the United Kingdom, founded with a simple mission:{" "}
        <span className="font-medium">
          to make powerlifting-specific knowledge more accessible and
          actionable.
        </span>
      </p>

      <p className="mb-4">
        Reliable powerlifting knowledge is scattered across videos, articles,
        research, and coaching experience. PowerliftingAI brings it together in
        one place — an AI coach that answers questions about:
      </p>

      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>Technique, weak-point diagnosis, and injury-aware training</li>
        <li>
          Program design and progression — with upload-your-program reviews
          coming soon
        </li>
        <li>Nutrition, recovery, and competition preparation</li>
        <li>
          Competition analytics on real meet results: compare lifters, track
          progressions, and see where your total sits in your class
        </li>
      </ul>

      <h2 className="font-display text-3xl font-bold uppercase mb-3 mt-8">
        How it works
      </h2>

      <p className="mb-4">
        Every question runs through the same AI runtime: it plans what the
        question needs, retrieves from a curated knowledge base built from the
        published work of named coaches and educators, queries a database of
        real competition results when numbers are involved, and checks the
        answer before it reaches you. No mystery training data — the sources
        are listed on this page.
      </p>

      <p className="mb-4">
        The free tier includes 15 questions a month. A paid tier will arrive
        alongside program reviews.
      </p>

      <hr className="my-8 border-gray-200" />

      <h2 className="font-display text-3xl font-bold uppercase mb-3">
        Competition data: OpenPowerlifting
      </h2>

      <p className="mb-4">
        Lifter comparisons and trend analysis run against the{" "}
        <strong>OpenPowerlifting</strong>{" "}archive — a community-driven
        initiative building a permanent, open record of the world&apos;s
        powerlifting results. All competition data provided by OpenPowerlifting
        are contributed to the <strong>Public Domain</strong>.
      </p>

      <p className="mb-4">
        <strong>Official attribution:</strong> This site uses data from the
        OpenPowerlifting project,{" "}
        <a
          href="https://www.openpowerlifting.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-red-600 hover:text-red-700"
        >
          https://www.openpowerlifting.org
        </a>
        . You may download a copy of the data at{" "}
        <a
          href="https://data.openpowerlifting.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-red-600 hover:text-red-700"
        >
          https://data.openpowerlifting.org
        </a>
        .
      </p>

      <hr className="my-8 border-gray-200" />

      <h2 className="font-display text-3xl font-bold uppercase mb-3">
        Knowledge sources &amp; acknowledgements
      </h2>

      <p className="mb-4">
        The knowledge base is curated from the publicly available educational
        work of coaches, researchers, and publications the powerlifting
        community actually trusts:
      </p>

      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2.5">
        {KNOWLEDGE_SOURCES.map((source) => (
          <li key={source.href}>
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-red-600 hover:text-red-700"
            >
              {source.name}
            </a>
          </li>
        ))}
      </ul>

      <p className="mb-4">
        Insights are synthesized from their publicly available content.
        PowerliftingAI is an independent project and is{" "}
        <strong>not affiliated with or endorsed by</strong> any of the
        individuals or organizations listed above.
      </p>

      <hr className="my-8 border-gray-200" />

      <h2 className="font-display text-3xl font-bold uppercase mb-3">
        Your feedback matters
      </h2>

      <p className="mb-4">
        The best technology is built <strong>with</strong>{" "}its community, not
        just for it. If you spot an error, have a suggestion, or want to share
        your thoughts, we&apos;d love to hear from you — real-world feedback
        directly shapes what gets built next.
      </p>

      <p className="text-sm text-gray-500">
        PowerliftingAI Ltd • Registered in the United Kingdom • Contact us at{" "}
        <a
          href="mailto:powerlifting.ai.01@gmail.com"
          className="underline text-red-600 hover:text-red-700"
        >
          powerlifting.ai.01@gmail.com
        </a>
      </p>
    </div>
  );
}
