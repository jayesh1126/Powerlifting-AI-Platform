"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders chat content as GitHub-flavoured markdown, tuned for bubbles:
 * tight vertical rhythm, scrollable tables/code, `invert` for dark bubbles.
 */
export function Markdown({
  children,
  invert = false,
}: {
  children: string;
  invert?: boolean;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none wrap-break-word",
        // Tighter spacing than the prose defaults — bubbles are compact.
        "prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-hr:my-3 prose-blockquote:my-2",
        // Code: no backtick pseudo-content, readable inline chips.
        "prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium",
        // Wide content scrolls inside the bubble instead of breaking layout.
        "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_pre]:overflow-x-auto",
        invert
          ? "prose-invert prose-code:bg-white/15"
          : "prose-code:bg-gray-100 prose-pre:bg-gray-900 prose-pre:text-gray-100"
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
