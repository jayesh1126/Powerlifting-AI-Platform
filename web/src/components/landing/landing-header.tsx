import Link from "next/link";
import Image from "next/image";
import { AuthCta } from "@/components/landing/auth-cta";

export function LandingHeader({ isAuthed }: { isAuthed: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950 text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="PowerliftingAI logo"
            width={28}
            height={28}
            className="h-6 w-auto"
          />
          <span className="font-extrabold tracking-tight">
            Powerlifting<span className="text-red-500">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-neutral-400 md:flex">
          <Link href="/#capabilities" className="transition-colors hover:text-white">
            What it does
          </Link>
          <Link href="/#evidence" className="transition-colors hover:text-white">
            Evidence
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-white">
            Pricing
          </Link>
          <Link href="/about" className="transition-colors hover:text-white">
            About
          </Link>
        </nav>

        <AuthCta
          isAuthed={isAuthed}
          variant="light"
          size="sm"
          label="Sign in"
        />
      </div>
    </header>
  );
}
