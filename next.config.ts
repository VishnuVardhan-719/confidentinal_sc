import type { NextConfig } from "next";

/*
 * Security headers (U02-sec). Rationale and trade-offs: docs/SECURITY_AUDIT_U02.md.
 *
 * CSP is static (no nonce) on purpose: the public pages are prerendered and use Partial Prerendering
 * (cacheComponents), and Next.js cannot put a per-request nonce into a prerendered shell. Next.js emits
 * inline bootstrap scripts (self.__next_f.push), so script-src needs 'unsafe-inline' until the pages are
 * rendered dynamically with a nonce from src/proxy.ts. 'unsafe-eval' is only allowed in development
 * (React uses eval for debugging there). Fonts are self-hosted by next/font, so no Google origins are needed.
 */

type CspOptions = { isDev: boolean; supabaseUrl?: string };

/** Origins for the future Supabase client (REST + Realtime), derived from the public URL. Ignores bad input. */
function supabaseOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:") return [];
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

export function buildCsp({ isDev, supabaseUrl }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // The Next.js dev overlay injects inline styles; production output uses stylesheets only.
    "style-src": ["'self'", ...(isDev ? ["'unsafe-inline'"] : [])],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...supabaseOrigins(supabaseUrl), ...(isDev ? ["ws:"] : [])],
    "media-src": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(options: CspOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    // Browsers ignore HSTS over plain HTTP, so this is inert locally. No "preload": that is hard to undo
    // and needs an owner decision once every subdomain of surecurevisit.in is HTTPS-only.
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "serial=()",
        "hid=()",
        "bluetooth=()",
        "accelerometer=()",
        "gyroscope=()",
        "magnetometer=()",
        "display-capture=()",
        "browsing-topics=()",
      ].join(", "),
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
}

const nextConfig: NextConfig = {
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
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          isDev: process.env.NODE_ENV === "development",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        }),
      },
    ];
  },
};

export default nextConfig;
