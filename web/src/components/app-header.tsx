"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { House, LogOut, Menu, MessageSquare, Settings } from "lucide-react";
import { useSidebar } from "@/components/chat/sidebar-context";
import { cn } from "@/lib/utils";

const NAV_ITEM =
  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors";
const NAV_IDLE = "text-neutral-400 hover:text-white hover:bg-white/10";
const NAV_ACTIVE = "bg-white/10 text-white font-medium";

/**
 * Single top bar for the authenticated app, styled to match the landing
 * header (dark, brand accent). On mobile chat pages it also hosts the
 * sidebar hamburger (state shared via SidebarProvider).
 */
export function AppHeader({ avatarUrl }: { avatarUrl?: string }) {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const isChatRoute = pathname.startsWith("/chat");

  return (
    <header className="h-12 shrink-0 border-b border-white/10 bg-neutral-950 text-white">
      <div className="h-full px-2 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isChatRoute && (
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-0.5 rounded-md hover:bg-white/10 text-neutral-300 cursor-pointer"
              aria-label="Open chat list"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Link href="/chat" className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo.png"
              alt="PowerliftingAI logo"
              width={28}
              height={28}
              className="h-6 w-auto shrink-0"
            />
            <span className="font-extrabold tracking-tight truncate">
              Powerlifting<span className="text-red-500">AI</span>
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1">
          <Link href="/" className={cn(NAV_ITEM, NAV_IDLE)}>
            <House className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>

          <Link
            href="/chat"
            className={cn(NAV_ITEM, isChatRoute ? NAV_ACTIVE : NAV_IDLE)}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat</span>
          </Link>

          <Link
            href="/settings"
            className={cn(
              NAV_ITEM,
              pathname === "/settings" ? NAV_ACTIVE : NAV_IDLE
            )}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className={cn(NAV_ITEM, NAV_IDLE, "cursor-pointer")}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>

          {avatarUrl && (
            <Image
              src={avatarUrl}
              alt="Your avatar"
              width={28}
              height={28}
              className="h-7 w-7 rounded-full border border-white/20 ml-1 shrink-0"
              unoptimized
            />
          )}
        </nav>
      </div>
    </header>
  );
}
