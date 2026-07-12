import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuth } from "@/lib/supabase/server";
import { LoginButton } from "@/components/login-button";
import { Footer } from "@/components/footer";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { claims } = await getAuth();
  if (claims) redirect("/chat");

  const { auth_error } = await searchParams;

  return (
    <div className="min-h-screen w-full flex flex-col bg-white text-black">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl text-center space-y-10">
          <div className="flex flex-col items-center space-y-3">
            <Image
              src="/logo.png"
              alt="PowerliftingAI logo"
              width={128}
              height={128}
              priority
              className="h-16 w-auto"
            />
            <h1 className="text-4xl font-extrabold tracking-tight">
              Powerlifting<span className="text-red-600">AI</span> Ltd
            </h1>
          </div>

          <div className="space-y-4">
            <p className="text-lg text-gray-700 max-w-lg mx-auto">
              PowerliftingAI is your intelligent training partner — a chatbot
              trained exclusively on real powerlifting data, records, and
              athlete insights.
            </p>
            <p className="text-sm text-gray-500">
              Whether you&apos;re optimizing technique or programming your next
              cycle, PowerliftingAI gives you answers grounded in elite lifting
              knowledge.
            </p>
          </div>

          {auth_error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-4 py-2 max-w-sm mx-auto">
              Sign-in failed. Please try again.
            </p>
          )}

          <LoginButton />
        </div>
      </div>
      <Footer />
    </div>
  );
}
