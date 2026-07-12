"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Settings } from "lucide-react";
import { useSidebar } from "@/components/chat/sidebar-context";
import { cn } from "@/lib/utils";

/**
 * Single top bar for the authenticated app. On mobile chat pages it also
 * hosts the sidebar hamburger (state shared via SidebarProvider), so
 * there's no second strip below the header.
 */
export function AppHeader({ avatarUrl }: { avatarUrl?: string }) {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const isChatRoute = pathname.startsWith("/chat");

  return (
    <header className="h-12 shrink-0 border-b border-gray-200 bg-white">
      <div className="h-full px-2 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isChatRoute && (
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-0.5 rounded-md hover:bg-gray-100 text-gray-600 cursor-pointer"
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
              Powerlifting<span className="text-red-600">AI</span>
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
              pathname === "/settings"
                ? "bg-gray-100 text-gray-900 font-medium"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 cursor-pointer transition-colors"
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
              className="h-7 w-7 rounded-full border border-gray-200 ml-1 shrink-0"
              unoptimized
            />
          )}
        </nav>
      </div>
    </header>
  );
}
