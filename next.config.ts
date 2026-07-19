import type { NextConfig } from "next";

// The Content-Security-Policy is set per-request in src/middleware.ts with a
// fresh nonce (no 'unsafe-inline' scripts in production). Static headers here
// cover everything that does not vary per request.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "@node-rs/argon2"],
  // Deliver metadata atomically with page content for every user agent
  // instead of in a deferred stream. With streamed metadata, a client-side
  // navigation commits the new page body before its <title> arrives, leaving
  // a window where the document has no title — a WCAG 2.4.2 failure that axe
  // caught on slower CI runners (all three browsers, first client navigation
  // of the e2e journey). All metadata in this app is static, so blocking
  // delivery costs nothing. See DECISIONS.md D-0022.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
