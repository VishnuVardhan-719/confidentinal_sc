import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { getPublishedStory } from "@/modules/content/public";
import { routing } from "./i18n/routing";
import { HOLDING_PATH, isPrelaunch, prelaunchDecision } from "./lib/launch-mode";

/** Locale routing, plus a real HTTP 404 for story URLs that are not published. No auth decisions here. */
const intl = createMiddleware(routing);

const STORY_PATH = /^\/(en|te|hi)\/stories\/([^/]+)\/?$/;

/**
 * With Cache Components a page's request-time notFound() runs after the streamed shell, so it
 * keeps HTTP 200. Unknown or unpublished story slugs are therefore answered here, before
 * rendering, by rewriting to the catch-all not-found page (prerendered with status 404).
 * A gated content backend (http adapter, no CMS contract yet) is not "not found": those
 * requests pass through and the page shows its "not available yet" state.
 */
export default async function proxy(request: NextRequest) {
  if (isPrelaunch()) {
    const decision = prelaunchDecision(request.nextUrl.pathname, request.method);
    if (decision.action === "refuse-method") {
      return new NextResponse("Not available yet", { status: 503, headers: { "Retry-After": "86400", "X-Robots-Tag": "noindex" } });
    }
    if (decision.action === "hold") {
      const url = request.nextUrl.clone();
      url.pathname = `/${decision.locale}${HOLDING_PATH}`;
      url.search = "";
      // The target page cannot set a status under Cache Components, so this stays 200; it is noindex by header and meta.
      return NextResponse.rewrite(url, { headers: { "X-Robots-Tag": "noindex" } });
    }
  }
  const match = STORY_PATH.exec(request.nextUrl.pathname);
  if (match) {
    const [, locale, rawSlug] = match;
    let slug: string | null = null;
    try {
      slug = decodeURIComponent(rawSlug);
    } catch {
      slug = null;
    }
    const story = slug ? await getPublishedStory(slug, locale as "en" | "te" | "hi") : { status: "not_found" as const };
    if (story.status === "not_found") {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/__not-found__`;
      return NextResponse.rewrite(url, { status: 404 });
    }
  }
  return intl(request);
}

export const config = {
  // Skip API routes, Next internals, Vercel internals and any path containing a dot (static files,
  // sitemap.xml, robots.txt).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
