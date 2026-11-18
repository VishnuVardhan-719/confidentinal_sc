import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Locale routing only: redirects un-prefixed paths to /{locale}/... . No auth decisions here. */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, Vercel internals and any path containing a dot (static files,
  // sitemap.xml, robots.txt).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
