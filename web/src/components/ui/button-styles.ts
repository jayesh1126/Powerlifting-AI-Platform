// Shared pill-button classes so the client LoginButton and server-rendered
// links (e.g. "Open chat") stay visually identical.

export const pillBase =
  "inline-flex cursor-pointer items-center justify-center rounded-full font-semibold transition-colors";

export const pillVariants = {
  /** Black pill for light backgrounds (the app's default button). */
  dark: "bg-neutral-950 text-white hover:bg-neutral-800",
  /** White pill for dark backgrounds (landing hero, closing band). */
  light: "bg-white text-neutral-950 hover:bg-neutral-200",
} as const;

export const pillSizes = {
  sm: "gap-2 px-4 py-2 text-sm",
  md: "gap-3 px-6 py-3",
} as const;

export type PillVariant = keyof typeof pillVariants;
export type PillSize = keyof typeof pillSizes;
