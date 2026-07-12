import { redirect } from "next/navigation";
import { getAuth } from "@/lib/supabase/server";
import { getAllChats } from "@/lib/db";
import { ChatShell } from "@/components/chat/chat-shell";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { data: chats } = await getAllChats(supabase, claims.sub);

  return <ChatShell chats={chats ?? []}>{children}</ChatShell>;
}
