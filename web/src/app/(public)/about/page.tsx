export const metadata = { title: "About – PowerliftingAI Ltd" };

const CREATOR_LINKS = [
  { name: "PRs Performance", href: "https://www.youtube.com/@PRsPerformance" },
  { name: "Yando (Instagram)", href: "https://www.instagram.com/yando_af/" },
  { name: "Gavin Adin", href: "https://www.youtube.com/@GavinAdin" },
  { name: "The Swolefessor", href: "https://www.youtube.com/@TheSwolefessor" },
  { name: "Conor Harris", href: "https://www.youtube.com/@conorharris" },
  {
    name: "Strong Ambitions Powerlifting",
    href: "https://www.youtube.com/@strongambitionspowerlifting",
  },
  { name: "P4P Coaching", href: "https://www.youtube.com/@P4PCoaching" },
  {
    name: "Reactive Training Systems",
    href: "https://www.youtube.com/@ReactiveTrainingSystems",
  },
  { name: "Calgary Barbell", href: "https://www.youtube.com/calgarybarbell" },
];

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="text-3xl font-extrabold mb-6">
        About <span className="text-red-600">PowerliftingAI Ltd</span>
      </h1>

      <p className="mb-4">
        <strong>PowerliftingAI Ltd</strong> is an independent technology
        company based in the United Kingdom, founded with a simple mission:{" "}
        <span className="font-medium">
          to make powerlifting-specific knowledge more accessible and
          actionable.
        </span>
      </p>

      <p className="mb-4">
        The sport of powerlifting involves complex decision-making in{" "}
        <strong>training</strong>, <strong>nutrition</strong>,{" "}
        <strong>recovery</strong>, and <strong>competition strategy</strong> —
        yet most reliable knowledge is scattered across research papers,
        forums, and coaching experience.
      </p>

      <p className="mb-4">
        Our AI chatbot brings this information together, helping athletes and
        coaches make better-informed choices about:
      </p>

      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>Technique optimization and injury prevention</li>
        <li>Training program design and progression</li>
        <li>Nutrition and recovery strategies</li>
        <li>Competition preparation and meet day planning</li>
        <li>Data-driven comparison and performance tracking</li>
      </ul>

      <p className="mb-4">
        By combining <strong>machine learning</strong> with{" "}
        <strong>expert-verified data</strong>, PowerliftingAI bridges the gap
        between science and real-world lifting experience — empowering lifters
        of all levels to train smarter, not just harder.
      </p>

      <hr className="my-8 border-gray-200" />

      <h2 className="text-2xl font-bold mb-3">Your Feedback Matters</h2>
      <p className="mb-4">
        At PowerliftingAI, we believe the best technology is built{" "}
        <strong>with</strong> its community, not just <strong>for</strong> it.
        Your feedback — whether it&apos;s about chatbot accuracy, usability, or
        new features you&apos;d like to see — directly helps us improve and
        refine the system.
      </p>
      <p className="mb-4">
        We continuously update our models, data, and features based on
        real-world user experience. If you spot an error, have a suggestion, or
        simply want to share your thoughts, we&apos;d love to hear from you.
      </p>
      <p className="mb-4">
        Together, we can make PowerliftingAI smarter, stronger, and more useful
        for lifters everywhere. 💪
      </p>

      <hr className="my-8 border-gray-200" />

      <h2 className="text-2xl font-bold mb-3">
        Special Thanks &amp; Data Attribution
      </h2>

      <p className="mb-4">
        PowerliftingAI makes use of publicly available competition data from
        the <strong>OpenPowerlifting</strong> project.
      </p>

      <p className="mb-4">
        OpenPowerlifting is a community-driven initiative dedicated to creating
        a permanent, open archive of the world&apos;s powerlifting results. All
        competition data provided by OpenPowerlifting are contributed to the{" "}
        <strong>Public Domain</strong>.
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

      <h2 className="text-2xl font-bold mb-3">
        Educational Influences &amp; Acknowledgements
      </h2>

      <p className="mb-4">
        PowerliftingAI has been shaped not only by data and research, but also
        by countless hours of educational content produced by experienced
        coaches and practitioners in the powerlifting community.
      </p>

      <p className="mb-4">
        I would like to give special thanks to the following creators, whose
        publicly available videos and posts helped inform the training
        principles, technical insights, and decision-making frameworks used
        when developing this project:
      </p>

      <ul className="list-disc pl-6 mb-4 space-y-2">
        {CREATOR_LINKS.map((creator) => (
          <li key={creator.href}>
            <a
              href={creator.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-red-600 hover:text-red-700"
            >
              {creator.name}
            </a>
          </li>
        ))}
      </ul>

      <p className="mb-4">
        Insights were derived by carefully studying their educational content
        and synthesizing common principles. PowerliftingAI is an independent
        project and is <strong>not affiliated with or endorsed by</strong> any
        of the individuals or organizations listed above.
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
