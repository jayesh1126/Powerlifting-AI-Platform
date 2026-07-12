import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 bg-white text-black mt-2 sm:mt-8">
      <div className="max-w-7xl mx-auto px-3 py-2 sm:px-4 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-y-2 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="PowerliftingAI logo"
            width={32}
            height={32}
            className="h-5 w-auto sm:h-8"
          />
          <span className="font-semibold text-sm sm:text-lg">
            Powerlifting<span className="text-red-600">AI</span> Ltd
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-4 text-gray-600">
          <Link href="/about" className="hover:text-black transition-colors">
            About
          </Link>
          <Link href="/terms" className="hover:text-black transition-colors">
            Terms of Use
          </Link>
          <Link href="/privacy" className="hover:text-black transition-colors">
            Privacy Policy
          </Link>
          <a
            href="mailto:powerlifting.ai.01@gmail.com"
            className="hover:text-black transition-colors"
          >
            Contact
          </a>
        </div>

        <p className="text-gray-500 text-center sm:text-right w-full sm:w-auto">
          © {new Date().getFullYear()} PowerliftingAI Ltd. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
