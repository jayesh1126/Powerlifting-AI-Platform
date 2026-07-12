"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
import { ArrowUp } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import type { ChatMode } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

export interface DisplayMessage {
  id: string;
  role: "User" | "Assistant";
  content: string;
  created_at: string;
}

const MODE_OPTIONS: { value: ChatMode; label: string }[] = [
  { value: "general", label: "General Q&A" },
  { value: "program", label: "Program builder" },
  { value: "openpowerlifting_analytics", label: "OpenPowerlifting" },
];

const MAX_INPUT_LENGTH = 2000;

/**
 * The chat surface. Mounted with `key={chatId}` by the page so switching
 * chats remounts with fresh server-loaded messages — no prop-sync effects.
 */
export function ChatView({
  chatId,
  initialMessages,
  monthlyRequests,
  monthlyLimit,
  userAvatarUrl,
}: {
  chatId?: string;
  initialMessages: DisplayMessage[];
  monthlyRequests: number;
  monthlyLimit: number;
  userAvatarUrl?: string;
}) {
  const router = useRouter();
  // For a brand-new chat the id arrives in the first response's
  // X-New-Chat-Id header; from then on we send it with every message.
  const [activeChatId, setActiveChatId] = useState(chatId);
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pendingAiMessage, setPendingAiMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [mode, setMode] = useState<ChatMode>("general");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, pendingAiMessage, isSending]);

  async function handleSend() {
    const userMessage = input.trim();
    if (!userMessage || isSending) return;
    // Mirrors the server-side zod schema so users get instant feedback.
    if (userMessage.length > MAX_INPUT_LENGTH || /[<>{}]/.test(userMessage)) {
      toast.error("Your message is invalid or too long.");
      return;
    }

    const prevMessages = messages;
    setIsSending(true);
    setInput("");
    setPendingAiMessage("");
    // Optimistic user bubble; rolled back if the request fails.
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${crypto.randomUUID()}`,
        role: "User",
        content: userMessage,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          chatId: activeChatId,
          mode,
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => null);
        toast.error(
          errorData?.message || "Error generating AI response. Please try again."
        );
        setMessages(prevMessages);
        return;
      }

      const newChatId = response.headers.get("X-New-Chat-Id");
      if (newChatId) {
        // Move to the chat's permanent URL without a server navigation:
        // a router.push would refetch the page and could race the async
        // message persistence, wiping the conversation we just streamed.
        // Next.js keeps its router state in sync with the History API.
        setActiveChatId(newChatId);
        window.history.replaceState(null, "", `/chat/${newChatId}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullMessage = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullMessage += chunk;
        setPendingAiMessage((prev) => prev + chunk);
      }
      fullMessage += decoder.decode();

      if (fullMessage.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-${crypto.randomUUID()}`,
            role: "Assistant",
            content: fullMessage,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setPendingAiMessage("");

      // Re-render server components (sidebar chat list, usage counter)
      // without touching this component's local state.
      router.refresh();
    } catch {
      toast.error("Connection lost while streaming the response.");
      setMessages(prevMessages);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 sm:px-4 py-4 sm:py-6 space-y-5">
          {messages.length === 0 && !isSending && (
            <div className="flex flex-col items-center justify-center text-center gap-3 pt-24 sm:pt-32">
              <Image
                src="/logo.png"
                alt="PowerliftingAI"
                width={56}
                height={56}
                className="h-14 w-auto opacity-90"
              />
              <p className="text-gray-500 text-sm max-w-xs">
                Ask anything about powerlifting — technique, programming, or
                meet data.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              timestamp={msg.created_at}
              userAvatarUrl={userAvatarUrl}
            >
              <Markdown invert={msg.role === "User"}>{msg.content}</Markdown>
            </MessageBubble>
          ))}

          {/* Streaming preview */}
          {pendingAiMessage && (
            <MessageBubble role="Assistant" dimmed>
              <Markdown>{pendingAiMessage}</Markdown>
            </MessageBubble>
          )}

          {/* Typing indicator */}
          {isSending && !pendingAiMessage && (
            <MessageBubble role="Assistant" dimmed>
              <span className="text-sm italic text-gray-400 animate-pulse">
                Thinking…
              </span>
            </MessageBubble>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mx-auto w-full max-w-3xl px-3 sm:px-4 pt-2.5 pb-1.5"
        >
          <div className="rounded-xl border border-gray-300 bg-white focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-black/10 transition-shadow">
            <textarea
              value={input}
              onChange={(e) => {
                if (e.target.value.length <= MAX_INPUT_LENGTH)
                  setInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Say something to PowerliftingAI..."
              rows={2}
              className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm focus:outline-none placeholder:text-gray-400"
            />

            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ChatMode)}
                className="h-8 rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 cursor-pointer focus:outline-none hover:bg-gray-100 transition-colors"
                aria-label="Chat mode"
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {monthlyRequests}/{monthlyLimit} this month
                </span>
                <button
                  type="submit"
                  disabled={!input.trim() || isSending}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-black text-white disabled:opacity-30 cursor-pointer hover:bg-gray-800 transition-colors"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 text-center mt-1.5">
            PowerliftingAI can make mistakes — verify training or health advice
            with a qualified professional.
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  timestamp,
  dimmed,
  userAvatarUrl,
  children,
}: {
  role: "User" | "Assistant";
  timestamp?: string;
  dimmed?: boolean;
  userAvatarUrl?: string;
  children: React.ReactNode;
}) {
  const isUser = role === "User";
  const avatarSrc = isUser ? userAvatarUrl : "/logo.png";

  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      {avatarSrc && (
        <Image
          src={avatarSrc}
          alt={isUser ? "You" : "PowerliftingAI"}
          width={28}
          height={28}
          className="h-7 w-7 rounded-full border border-gray-200 bg-white object-contain shrink-0 mt-0.5"
          unoptimized={isUser} // external Google avatar URL
        />
      )}
      <div className="max-w-[85%] sm:max-w-[75%] space-y-0.5">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 shadow-sm",
            isUser
              ? "bg-black text-white rounded-tr-sm"
              : "bg-white border border-gray-200 text-gray-900 rounded-tl-sm",
            dimmed && "opacity-80"
          )}
        >
          {children}
        </div>
        {timestamp && (
          <p
            className={cn(
              "text-[10px] text-gray-400 px-1",
              isUser && "text-right"
            )}
          >
            {formatDateTime(timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}
