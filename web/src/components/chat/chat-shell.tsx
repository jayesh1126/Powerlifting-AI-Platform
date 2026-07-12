"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/types";
import { useSidebar } from "@/components/chat/sidebar-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Client shell around the chat pages: desktop collapsible sidebar and a
 * mobile slide-in drawer. The drawer is opened from the hamburger in the
 * app header via SidebarProvider.
 */
export function ChatShell({
  chats,
  children,
}: {
  chats: Chat[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false); // desktop
  const { mobileOpen, setMobileOpen } = useSidebar();

  // Navigating (tapping a chat) closes the mobile drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r border-gray-200 bg-white transition-[width] duration-200",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <SidebarContent
          chats={chats}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white border-r border-gray-200 shadow-xl flex flex-col">
            <SidebarContent
              chats={chats}
              collapsed={false}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">{children}</div>
    </div>
  );
}

function SidebarContent({
  chats,
  collapsed,
  onToggle,
  onClose,
}: {
  chats: Chat[];
  collapsed: boolean;
  onToggle?: () => void; // desktop collapse
  onClose?: () => void; // mobile drawer close
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!chatToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/chats/${chatToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Chat deleted");
      if (pathname === `/chat/${chatToDelete.id}`) {
        router.push("/chat");
      }
      router.refresh();
    } catch {
      toast.error("Failed to delete chat");
    } finally {
      setIsDeleting(false);
      setChatToDelete(null);
    }
  }

  return (
    <>
      {/* Top row: toggle + new chat */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-gray-200 p-2 shrink-0",
          collapsed && "flex-col"
        )}
      >
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 cursor-pointer"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" />
            )}
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Close chat list"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        )}

        {collapsed ? (
          <Link
            href="/chat"
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="h-4.5 w-4.5" />
          </Link>
        ) : (
          <Link
            href="/chat"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-black text-white text-sm font-medium py-2 hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Link>
        )}
      </div>

      {/* Chat list */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {chats.length === 0 && !collapsed && (
          <p className="text-xs text-gray-400 px-3 py-2">
            No chats yet — start one!
          </p>
        )}
        {chats.map((chat) => {
          const isActive = pathname === `/chat/${chat.id}`;
          return (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              title={chat.title || "Untitled"}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed && "justify-center px-0"
              )}
            >
              {collapsed ? (
                <MessageSquare className="h-4 w-4 text-gray-500 shrink-0" />
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate">
                    {chat.title || "Untitled"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setChatToDelete(chat);
                    }}
                    className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors cursor-pointer opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <ConfirmDialog
        open={!!chatToDelete}
        title="Delete chat?"
        description={`"${chatToDelete?.title || "Untitled"}" and all its messages will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setChatToDelete(null)}
      />
    </>
  );
}
