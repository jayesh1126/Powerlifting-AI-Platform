import { redirect } from "next/navigation";
import { getAuth } from "@/lib/supabase/server";
import { getMonthlyRequestCount } from "@/lib/db";
import { FREE_MONTHLY_LIMIT } from "@/lib/quota";
import { ChatView } from "@/components/chat/chat-view";

/**
 * New-chat page. The first send creates the chat server-side; ChatView
 * then swaps the URL to /chat/<id> via the History API (no remount).
 */
export default async function NewChatPage() {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { count } = await getMonthlyRequestCount(supabase, claims.sub);

  const avatarUrl = (
    claims.user_metadata as { avatar_url?: string } | undefined
  )?.avatar_url;

  return (
    <ChatView
      initialMessages={[]}
      monthlyRequests={count}
      monthlyLimit={FREE_MONTHLY_LIMIT}
      userAvatarUrl={avatarUrl}
    />
  );
}
