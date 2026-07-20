import { Big_Shoulders } from "next/font/google";

/**
 * Display face for marketing surfaces (landing + public pages). Big Shoulders
 * has no entry in next/font's fallback-metrics table, so automatic fallback
 * adjustment is disabled (it only logs a warning) and a condensed system
 * stack is used instead.
 */
export const displayFont = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
});
