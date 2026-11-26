import type { MetadataRoute } from "next";
import { SITE_URL, isIndexable } from "@/components/public/seo";
import { isPrelaunch } from "@/lib/launch-mode";

/** Search and answer-engine crawlers we want reading the public pages (generative engine optimisation). */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
] as const;

const PRIVATE_SEGMENTS = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin", "workspace", "account"];
/** Closed in pre-launch mode (src/lib/launch-mode.ts): the proxy answers 503, crawlers need not try. */
const PRELAUNCH_CLOSED = ["doctors", "lab-tests", "ambulances", "caretakers", "stories", "become-a-provider", "login", "signup", "find", "launching-soon"];

/**
 * Crawl rules. Non-production deployments disallow everything. Private workspaces are disallowed in
 * production too; this is a crawl hint only, real protection is server-side auth.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const rule = (userAgent: string | string[]) => ({
    userAgent,
    allow: "/",
    disallow: ["/api/", ...[...PRIVATE_SEGMENTS, ...(isPrelaunch() ? PRELAUNCH_CLOSED : [])].map((s) => `/*/${s}`)],
  });
  return {
    rules: [rule("*"), rule([...AI_CRAWLERS])],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
