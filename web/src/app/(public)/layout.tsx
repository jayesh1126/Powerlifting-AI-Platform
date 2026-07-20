import { getAuth } from "@/lib/supabase/server";
import { displayFont } from "@/lib/fonts";
import { Footer } from "@/components/footer";
import { LandingHeader } from "@/components/landing/landing-header";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { claims } = await getAuth();

  return (
    <div
      className={`${displayFont.variable} flex min-h-screen flex-col bg-white text-gray-900`}
    >
      <LandingHeader isAuthed={Boolean(claims)} />
      <main className="w-full flex-1">{children}</main>
      <Footer />
    </div>
  );
}
