import Link from "next/link";
import Image from "next/image";
import { Footer } from "@/components/footer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="PowerliftingAI logo"
              width={32}
              height={32}
              className="h-7 w-auto"
            />
            <span className="font-extrabold tracking-tight">
              Powerlifting<span className="text-red-600">AI</span>
            </span>
          </Link>
          <nav className="text-sm text-gray-500 space-x-4">
            <Link href="/about" className="hover:text-gray-900">
              About
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full">{children}</main>
      <Footer />
    </div>
  );
}
