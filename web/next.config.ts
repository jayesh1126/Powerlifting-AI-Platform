import type { NextConfig } from "next";

// Parity with the old app's headers-middleware. CSP is deliberately absent
// for now: the old app used a per-request nonce, which in Next requires
// middleware plumbing — tracked in the README backlog.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Minimal server bundle for the Docker image (copied from .next/standalone).
  output: "standalone",
  // Hide the floating Next.js dev-tools badge (bottom-left in dev mode).
  devIndicators: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
