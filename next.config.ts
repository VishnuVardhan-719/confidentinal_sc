import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// FE01: next-intl request config lives in src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";
const isProduction = process.env.APP_ENV === "production";

/** Supabase origin (https + wss for realtime) from the public env, when configured. */
function supabaseOrigins(): string[] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (url.protocol !== "https:" && !isDev) return [];
    return [url.origin, `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`];
  } catch {
    return [];
  }
}

/**
 * Content Security Policy.
 * - script-src keeps 'unsafe-inline' because Next's inline bootstrap scripts need it and nonces would
 *   force every page to render dynamically (we rely on Cache Components static shells). No third-party
 *   script origins are allowed; add approved vendors (e.g. Razorpay) explicitly when their gate opens.
 * - style-src 'unsafe-inline' is needed for next/font and Radix positioning styles.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins().join(" ")}${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`.trim(),
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays available to our own origin for the consent-based LocationPicker.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
