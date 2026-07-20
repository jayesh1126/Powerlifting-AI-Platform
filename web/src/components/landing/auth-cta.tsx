import Link from "next/link";
import { LoginButton } from "@/components/login-button";
import { cn } from "@/lib/utils";
import {
  pillBase,
  pillVariants,
  pillSizes,
  type PillVariant,
  type PillSize,
} from "@/components/ui/button-styles";

/**
 * The landing page's primary action: Google sign-in for visitors, a plain
 * "Open chat" link for users who are already signed in.
 */
export function AuthCta({
  isAuthed,
  variant = "dark",
  size = "md",
  label = "Start free with Google",
  authedLabel = "Open chat",
  className,
}: {
  isAuthed: boolean;
  variant?: PillVariant;
  size?: PillSize;
  label?: string;
  authedLabel?: string;
  className?: string;
}) {
  if (isAuthed) {
    return (
      <Link
        href="/chat"
        className={cn(pillBase, pillVariants[variant], pillSizes[size], className)}
      >
        {authedLabel}
      </Link>
    );
  }
  return (
    <LoginButton
      variant={variant}
      size={size}
      label={label}
      className={className}
    />
  );
}
