export const metadata = { title: "Privacy Policy – PowerliftingAI Ltd" };

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="font-display text-4xl font-bold uppercase sm:text-5xl mb-6">
        Privacy Policy
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        Last updated: 28 December 2025
      </p>

      <p className="mb-4">
        <strong>PowerliftingAI Ltd</strong> (“we”, “our”, “us”) is committed to
        protecting your privacy and handling your data responsibly. This
        Privacy Policy explains how we collect, use, store, and protect your
        personal information when you use our website and AI chatbot (the
        “Service”).
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        1. Information We Collect
      </h2>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>
          <strong>Authentication Data:</strong> When you sign in with Google or
          another OAuth provider via Supabase, we collect your name, email, and
          profile picture to create and manage your account.
        </li>
        <li>
          <strong>Chat and Interaction Data:</strong> We store encrypted
          messages and AI responses to provide chat continuity, improve model
          accuracy, and ensure service quality. Non-sensitive metadata such as
          chat titles and summaries may be stored in plain text.
        </li>
        <li>
          <strong>Billing Information:</strong> Payments and subscriptions are
          handled securely by <strong>Stripe</strong>. We never store your full
          payment details on our servers.
        </li>
        <li>
          <strong>Usage Data:</strong> We may collect non-identifiable
          analytics such as session duration, feature usage, or performance
          metrics to enhance the Service.
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        2. How We Use Your Information
      </h2>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>To authenticate and manage your account.</li>
        <li>To deliver and personalize chatbot interactions.</li>
        <li>To process payments and manage subscriptions.</li>
        <li>To secure our platform and detect misuse or abuse.</li>
        <li>To improve our AI models and overall service performance.</li>
        <li>
          We may analyze anonymized and aggregated chat queries internally to
          identify gaps in our knowledge base and improve informational
          coverage, without identifying individual users.
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        3. Data Storage and Encryption
      </h2>
      <p className="mb-4">
        User messages and AI responses are encrypted before storage in our
        Supabase database. Other non-sensitive information, such as chat names,
        summaries, and subscription data, may be stored unencrypted for
        functionality purposes. Access to all data is strictly controlled and
        logged.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        4. Legal Basis for Processing
      </h2>
      <p className="mb-4">
        We process your personal data under the UK GDPR based on one or more of
        the following legal bases:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>
          To perform a contract with you (e.g. providing the chatbot service).
        </li>
        <li>With your consent (e.g. when authenticating with Google).</li>
        <li>To comply with legal obligations.</li>
        <li>
          For legitimate business interests, such as improving platform
          performance and security.
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Retention</h2>
      <p className="mb-4">
        We retain personal data only as long as necessary to provide the
        Service or meet legal obligations. When you delete your account, all
        associated data — including messages, chat history, and subscriptions —
        is permanently deleted through a cascade process in our database.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">6. Sharing Your Data</h2>
      <p className="mb-4">
        We never sell, rent, or trade your personal information. However, we
        may share limited data with trusted third-party processors who help us
        operate our Service:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>
          <strong>Supabase:</strong> Authentication, database storage, and
          hosting.
        </li>
        <li>
          <strong>Stripe:</strong> Secure payment processing and subscription
          management.
        </li>
        <li>
          <strong>OpenAI / LLM Providers:</strong> To generate chatbot
          responses based on your queries. Chat data may be temporarily
          processed by these models but is not used to train third-party
          systems.
        </li>
      </ul>
      <p className="mb-4">
        All third-party providers comply with strict data protection agreements
        and only process information as necessary to support our Service.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">7. Your Rights</h2>
      <p className="mb-4">Under the UK GDPR, you have the right to:</p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>Access the personal data we hold about you.</li>
        <li>Request correction or deletion of your data.</li>
        <li>Withdraw consent to data processing (where applicable).</li>
        <li>
          Request a copy of your data (“data portability”) in a structured,
          commonly used format.
        </li>
        <li>
          Lodge a complaint with the UK Information Commissioner’s Office (ICO)
          if you believe your rights have been violated.
        </li>
      </ul>
      <p className="mb-4">
        You can submit any data access, deletion, or correction request by
        contacting us at{" "}
        <a
          href="mailto:powerlifting.ai.01@gmail.com"
          className="text-red-600 underline"
        >
          powerlifting.ai.01@gmail.com
        </a>
        . You can also delete your account directly from within the Service.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">8. Security</h2>
      <p className="mb-4">
        We use encryption, access controls, and other technical safeguards to
        protect your information from unauthorized access, alteration, or
        disclosure. While we take strong precautions, no online service can
        guarantee absolute security.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        9. International Data Transfers
      </h2>
      <p className="mb-4">
        Some of our service providers (e.g., Supabase or OpenAI) may process
        data outside the United Kingdom. In such cases, we ensure that adequate
        safeguards (such as Standard Contractual Clauses) are in place to
        protect your personal data.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        10. Cookies &amp; Local Storage
      </h2>
      <p className="mb-4">
        PowerliftingAI uses only strictly necessary cookies and local storage
        technologies required for authentication, security, and core platform
        functionality. These include Supabase session tokens and Stripe
        checkout state. We do not use analytics, tracking, or advertising
        cookies.
      </p>
      <p className="mb-4">
        Because these cookies are essential to the operation of the Service,
        they cannot be disabled through individual consent. By continuing to
        use the Service, you acknowledge the use of these essential
        technologies.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        11. Children’s Privacy
      </h2>
      <p className="mb-4">
        The Service is not intended for users under the age of 18. We do not
        knowingly collect personal data from children. If we become aware that
        a minor’s information has been collected, we will delete it
        immediately.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        12. Business Transfers
      </h2>
      <p className="mb-4">
        If PowerliftingAI Ltd is involved in a merger, acquisition, asset sale,
        or financing, user information may be transferred as part of that
        transaction in accordance with applicable data protection laws.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        13. Global Privacy Control (GPC)
      </h2>
      <p className="mb-4">
        PowerliftingAI does not currently recognize or respond to Global
        Privacy Control (GPC) browser signals, as we do not sell or share
        personal information for advertising purposes.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        14. Data Protection Officer
      </h2>
      <p className="mb-4">
        We are not required to appoint a formal Data Protection Officer (DPO)
        under UK GDPR at this time. However, all privacy-related matters are
        handled directly by management.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        15. Updates to This Policy
      </h2>
      <p className="mb-4">
        We may update this Privacy Policy periodically to reflect new legal or
        operational requirements. The revised version will be posted here with
        a new “Last updated” date.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">16. Contact Us</h2>
      <p>
        For privacy inquiries or data access requests, please contact us at{" "}
        <a
          href="mailto:powerlifting.ai.01@gmail.com"
          className="text-red-600 underline"
        >
          powerlifting.ai.01@gmail.com
        </a>
        .
      </p>
    </div>
  );
}
