import type { Metadata } from "next";
import { displayFont } from "@/lib/fonts";
import { getAuth } from "@/lib/supabase/server";
import { Footer } from "@/components/footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { Hero } from "@/components/landing/hero";
import { Capabilities } from "@/components/landing/capabilities";
import { Evidence } from "@/components/landing/evidence";
import { Pricing } from "@/components/landing/pricing";
import { ClosingCta } from "@/components/landing/closing-cta";

export const metadata: Metadata = {
  title: "PowerliftingAI — Powerlifting answers, grounded in evidence",
  description:
    "An AI coach for powerlifters: technique, programming, and meet prep, answered from the published work of trusted coaches and millions of real competition results. 15 free questions a month.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { claims } = await getAuth();
  const { auth_error } = await searchParams;
  const isAuthed = Boolean(claims);

  return (
    <div
      className={`${displayFont.variable} flex min-h-screen flex-col bg-white text-neutral-950`}
    >
      <LandingHeader isAuthed={isAuthed} />
      <main className="flex-1">
        <Hero isAuthed={isAuthed} authError={Boolean(auth_error)} />
        <Capabilities />
        <Evidence />
        <Pricing isAuthed={isAuthed} />
        <ClosingCta isAuthed={isAuthed} />
      </main>
      <Footer />
    </div>
  );
}
