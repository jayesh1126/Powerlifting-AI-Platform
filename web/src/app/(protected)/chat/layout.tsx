import { redirect } from "next/navigation";
import { getAuth } from "@/lib/supabase/server";
import { getAllChats } from "@/lib/db";
import { Sidebar } from "@/components/chat/sidebar";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { data: chats } = await getAllChats(supabase, claims.sub);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar chats={chats ?? []} />
      <main className="flex-1 min-w-0 h-full">{children}</main>
    </div>
  );
}
