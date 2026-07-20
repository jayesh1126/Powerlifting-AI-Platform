import { redirect } from "next/navigation";
import { getAuth } from "@/lib/supabase/server";
import {
  getChatOwner,
  getMessagesForChat,
  getMonthlyRequestCount,
} from "@/lib/db";
import { FREE_MONTHLY_LIMIT } from "@/lib/quota";
import { ChatView, type DisplayMessage, type Source } from "@/components/chat/chat-view";

export default async function ChatByIdPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { chatId } = await params;

  const [chatResult, messagesResult, countResult] = await Promise.all([
    getChatOwner(supabase, chatId),
    getMessagesForChat(supabase, claims.sub, chatId),
    getMonthlyRequestCount(supabase, claims.sub),
  ]);

  // RLS hides other users' chats entirely, so a missing row covers both
  // "doesn't exist" and "not yours".
  if (!chatResult.data || messagesResult.error) redirect("/chat");

  const displayMessages: DisplayMessage[] = (messagesResult.data ?? []).map(
    (m) => ({
      id: m.id,
      role: m.role as DisplayMessage["role"],
      content: m.content,
      created_at: m.created_at,
      citations: (m.citations as unknown as Source[]) ?? null,
    }),
  );

  const avatarUrl = (
    claims.user_metadata as { avatar_url?: string } | undefined
  )?.avatar_url;

  return (
    <ChatView
      key={chatId}
      chatId={chatId}
      initialMessages={displayMessages}
      monthlyRequests={countResult.count}
      monthlyLimit={FREE_MONTHLY_LIMIT}
      userAvatarUrl={avatarUrl}
    />
  );
}
