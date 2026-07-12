"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/types";

export function Sidebar({ chats }: { chats: Chat[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMobile) setIsOpen(false);
  }, [pathname, isMobile]);

  async function handleDelete(chatId: string) {
    if (deletingId) return;
    if (!window.confirm("Delete this chat? This action cannot be undone.")) {
      return;
    }
    setDeletingId(chatId);
    try {
      const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Chat deleted");
      if (pathname === `/chat/${chatId}`) {
        router.push("/chat");
      }
      router.refresh();
    } catch {
      toast.error("Failed to delete chat");
    } finally {
      setDeletingId(null);
    }
  }

  // Mobile: collapsed sidebar renders just a floating opener.
  if (isMobile && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-14 left-2 z-50 p-2 rounded-md border border-gray-200 shadow-sm bg-white hover:bg-gray-100"
        aria-label="Open sidebar"
      >
        <ChevronRight className="h-5 w-5 text-gray-600" />
      </button>
    );
  }

  return (
    <aside
      className={cn(
        "border-r border-gray-200 bg-white flex flex-col transition-all duration-300 shadow-sm z-40 shrink-0",
        isMobile ? "fixed inset-0 top-10 w-full h-auto" : isOpen ? "w-64" : "w-16"
      )}
    >
      <div className="p-2 flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md hover:bg-gray-100 cursor-pointer"
          aria-label="Toggle sidebar"
        >
          {isOpen ? (
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-600" />
          )}
        </button>

        {isOpen ? (
          <Link
            href="/chat"
            className="flex-1 flex items-center justify-center py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Link>
        ) : (
          <Link
            href="/chat"
            className="p-2 mx-auto rounded-md hover:bg-gray-100"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4 text-gray-600" />
          </Link>
        )}
      </div>

      <nav className="flex-1 p-2 overflow-y-auto space-y-1">
        {chats.map((chat) => {
          const isActive = pathname === `/chat/${chat.id}`;
          return (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className={cn(
                "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              {isOpen ? (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate" title={chat.title || "Untitled"}>
                    {chat.title || "Untitled"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(chat.id);
                    }}
                    disabled={deletingId === chat.id}
                    className={cn(
                      "p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer",
                      isMobile
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    )}
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <MessageSquare className="mx-auto h-4 w-4 text-gray-500" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
