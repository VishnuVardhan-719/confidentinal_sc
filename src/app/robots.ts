import type { MetadataRoute } from "next";
import { SITE_URL, isIndexable } from "@/components/public/seo";

const PRIVATE_SEGMENTS = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin", "workspace", "account"];

/**
 * Crawl rules. Non-production deployments disallow everything. Private workspaces are disallowed in
 * production too; this is a crawl hint only, real protection is server-side auth.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...PRIVATE_SEGMENTS.map((s) => `/*/${s}`)],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
