import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getAuth } from "@/lib/supabase/server";

/**
 * Auth-gated app shell. Middleware already redirects unauthenticated
 * traffic, but we re-check here so the guarantee doesn't depend on the
 * matcher config alone.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { claims } = await getAuth();
  if (!claims) redirect("/");

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900">
      <header className="border-b border-gray-200 shrink-0">
        <div className="px-4 py-2 flex items-center justify-between">
          <Link href="/chat" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="PowerliftingAI logo"
              width={28}
              height={28}
              className="h-6 w-auto"
            />
            <span className="font-extrabold tracking-tight">
              Powerlifting<span className="text-red-600">AI</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/settings" className="hover:text-gray-900">
              Settings
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="hover:text-gray-900 cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
