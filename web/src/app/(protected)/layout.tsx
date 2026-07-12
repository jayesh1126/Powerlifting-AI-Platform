import { redirect } from "next/navigation";
import { getAuth } from "@/lib/supabase/server";
import { SidebarProvider } from "@/components/chat/sidebar-context";
import { AppHeader } from "@/components/app-header";

/**
 * Auth-gated app shell. The proxy already redirects unauthenticated
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

  const avatarUrl = (
    claims.user_metadata as { avatar_url?: string } | undefined
  )?.avatar_url;

  return (
    <SidebarProvider>
      <div className="h-screen flex flex-col bg-white text-gray-900">
        <AppHeader avatarUrl={avatarUrl} />
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    </SidebarProvider>
  );
}
